import {
  type DeviceContext,
  type IcmpEcho,
  type IcmpError,
  type Ipv4Packet,
  type NetworkTimer,
  SIM_TIMING,
  type SimTracertRequest,
  type TracertEndingResult,
  type TracertHopResult,
  type TracertLimits,
  type TracertProbeResult,
  type TracertSession,
} from '../contract'
import { EchoProbes } from './EchoProbes'
import { L3Notes } from './L3Notes'
import { NetworkRuntimes } from './NetworkRuntimes'
import type { PacketSender } from './PacketSender'

const WINDOWS_LIMITS: TracertLimits = { maxHops: 30, probesPerHop: 3, maxSilentHops: 4 }
/** Data bytes of a tracert probe (Windows sends a small echo; the lab uses ping's default). */
const PROBE_BYTES = 32

/**
 * Windows `tracert` (docs/SIMULATION.md §7.2): `probesPerHop` echoes with TTL 1, 2, …; each hop is
 * answered by time exceeded (a router), an echo reply (the destination: done), an unreachable (done)
 * or nothing. Stops after `maxSilentHops` silent hops in a row or at `maxHops`. Timing as ping.
 */
export class TracertClient {
  private readonly sender: PacketSender

  constructor(sender: PacketSender) {
    this.sender = sender
  }

  start(ctx: DeviceContext, requestId: string, request: SimTracertRequest): void {
    const limits: TracertLimits = {
      maxHops: Math.max(1, request.maxHops),
      probesPerHop: Math.max(1, request.probesPerHop),
      maxSilentHops: Math.max(1, request.maxSilentHops),
    }
    const session: TracertSession = {
      kind: 'tracert',
      requestId,
      targetIp: request.targetIp,
      identifier: NetworkRuntimes.takeEchoIdentifier(ctx),
      hop: 1,
      probe: 0,
      silentHops: 0,
      awaiting: null,
      limits,
      hops: [],
    }
    NetworkRuntimes.putSession(ctx, session)
    this.sendProbe(ctx, session)
  }

  onTimer(ctx: DeviceContext, session: TracertSession, timer: NetworkTimer): void {
    if (timer.kind === 'nextEcho') {
      if (session.awaiting === null) this.sendProbe(ctx, session)
      return
    }
    const awaiting = session.awaiting
    if (awaiting?.sequence !== timer.sequence) return
    const event = ctx.openEvent({ flowId: session.requestId, protocol: 'icmp' })
    event.note(3, 'in', L3Notes.of('echoTimeout', { sequence: awaiting.sequence, ms: SIM_TIMING.echoTimeoutMs }))
    event.conclude('timedOut', 3, 'requestTimedOut')
    this.record(ctx, session, { kind: 'timeout' }, 0)
  }

  onEchoReply(ctx: DeviceContext, session: TracertSession, reply: Ipv4Packet, echo: IcmpEcho): boolean {
    const awaiting = session.awaiting
    if (awaiting?.sequence !== echo.sequence) return false
    this.record(ctx, session, { kind: 'echoReply', fromIp: reply.src, rttMs: ctx.now - awaiting.sentAt }, SIM_TIMING.echoIntervalMs)
    return true
  }

  onError(ctx: DeviceContext, session: TracertSession, fromIp: string, error: IcmpError): boolean {
    const awaiting = session.awaiting
    const quoted = EchoProbes.quotedEcho(error)
    if (!awaiting || quoted?.sequence !== awaiting.sequence) return false
    const rttMs = ctx.now - awaiting.sentAt
    const result: TracertProbeResult =
      error.type === 'timeExceeded' ? { kind: 'timeExceeded', fromIp, rttMs } : { kind: 'unreachable', fromIp, rttMs, code: error.code }
    this.record(ctx, session, result, SIM_TIMING.echoIntervalMs)
    return true
  }

  private sendProbe(ctx: DeviceContext, previous: TracertSession): void {
    const limits = previous.limits ?? WINDOWS_LIMITS
    const sequence = (previous.hop - 1) * limits.probesPerHop + previous.probe + 1
    const ids = ctx.newPdu(previous.requestId)
    const session: TracertSession = { ...previous, awaiting: { sequence, sentAt: ctx.now, pduId: ids.pduId } }
    NetworkRuntimes.putSession(ctx, session)
    ctx.schedule(SIM_TIMING.echoTimeoutMs, { layer: 'network', kind: 'echoTimeout', requestId: session.requestId, sequence })
    const payload: IcmpEcho = { kind: 'icmp', type: 'echoRequest', identifier: session.identifier, sequence, dataBytes: PROBE_BYTES }
    const sent = this.sender.send(ctx, { ids, dst: session.targetIp, ttl: session.hop, payload }, [
      L3Notes.of('tracertProbe', { dst: session.targetIp, ttl: session.hop }),
    ])
    if (sent.ok) return
    const current = NetworkRuntimes.session(ctx, session.requestId)
    if (current?.kind !== 'tracert' || current.awaiting?.sequence !== sequence) return
    const refusal = EchoProbes.classifyRefusal(ctx, session.targetIp, sent.reason)
    if (refusal.kind === 'silent') return
    if (refusal.kind === 'localFailure') {
      this.finish(ctx, current, { kind: 'localFailure', reason: refusal.reason })
      return
    }
    this.record(ctx, current, { kind: 'unreachable', fromIp: refusal.fromIp, rttMs: 0, code: 'host' }, SIM_TIMING.echoIntervalMs)
  }

  /** Adds a probe result to the current hop; ends the hop (and maybe the trace) after its last probe. */
  private record(ctx: DeviceContext, session: TracertSession, result: TracertProbeResult, nextInMs: number): void {
    const limits = session.limits ?? WINDOWS_LIMITS
    const hops = TracertClient.withProbe(session.hops ?? [], session.hop, result)
    const probes = hops[hops.length - 1]?.probes ?? []
    let next: TracertSession = { ...session, awaiting: null, hops }
    if (session.probe + 1 < limits.probesPerHop) {
      next = { ...next, probe: session.probe + 1 }
    } else {
      const silent = probes.every((probe) => probe.kind === 'timeout')
      const silentHops = silent ? session.silentHops + 1 : 0
      const ending = TracertClient.ending(probes, silentHops, session.hop, limits)
      if (ending) {
        this.finish(ctx, next, ending)
        return
      }
      next = { ...next, hop: session.hop + 1, probe: 0, silentHops }
    }
    NetworkRuntimes.putSession(ctx, next)
    ctx.report(session.requestId, { kind: 'tracert', hops, ending: null }, false)
    if (nextInMs === 0) this.sendProbe(ctx, next)
    else ctx.schedule(nextInMs, { layer: 'network', kind: 'nextEcho', requestId: session.requestId })
  }

  private finish(ctx: DeviceContext, session: TracertSession, ending: TracertEndingResult): void {
    NetworkRuntimes.removeSession(ctx, session.requestId)
    ctx.report(session.requestId, { kind: 'tracert', hops: session.hops ?? [], ending }, true)
  }

  /** The trace ends at the destination, at an unreachable, after too many silent hops or at the hop limit. */
  private static ending(probes: readonly TracertProbeResult[], silentHops: number, hop: number, limits: TracertLimits): TracertEndingResult | null {
    if (probes.some((probe) => probe.kind === 'echoReply')) return { kind: 'reached' }
    for (const probe of probes) {
      if (probe.kind === 'unreachable') return { kind: 'unreachable', reporterIp: probe.fromIp, code: probe.code }
    }
    if (silentHops >= limits.maxSilentHops) return { kind: 'silent' }
    return hop >= limits.maxHops ? { kind: 'hopLimit' } : null
  }

  private static withProbe(hops: readonly TracertHopResult[], ttl: number, result: TracertProbeResult): TracertHopResult[] {
    const last = hops[hops.length - 1]
    if (last?.ttl === ttl) return [...hops.slice(0, -1), { ttl, probes: [...last.probes, result] }]
    return [...hops, { ttl, probes: [result] }]
  }
}
