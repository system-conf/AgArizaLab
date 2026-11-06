import {
  type DeviceContext,
  DeviceProfiles,
  type EchoResult,
  type IcmpEcho,
  type IcmpError,
  type Ipv4Packet,
  type NetworkTimer,
  type PingSession,
  SIM_TIMING,
  SIM_TTL,
  type SimPingRequest,
} from '../contract'
import { EchoProbes } from './EchoProbes'
import { L3Notes } from './L3Notes'
import { NetworkRuntimes } from './NetworkRuntimes'
import type { PacketSender } from './PacketSender'

/**
 * Windows `ping` (docs/SIMULATION.md §7.2, §3.4): echoes 1..count one at a time; the next echo leaves
 * 1000 ms after a reply or an error and at once after a 4000 ms timeout. Every echo's result is
 * reported as it happens; the last one finishes the request.
 */
export class PingClient {
  private readonly sender: PacketSender

  constructor(sender: PacketSender) {
    this.sender = sender
  }

  start(ctx: DeviceContext, requestId: string, request: SimPingRequest): void {
    const defaultTtl = DeviceProfiles.of(ctx.device).ipRole === 'router' ? SIM_TTL.router : SIM_TTL.host
    const session: PingSession = {
      kind: 'ping',
      requestId,
      targetIp: request.targetIp,
      identifier: NetworkRuntimes.takeEchoIdentifier(ctx),
      count: request.count,
      size: request.size,
      ttl: request.ttl ?? defaultTtl,
      sent: 0,
      awaiting: null,
      echoes: [],
    }
    if (session.count < 1) {
      ctx.report(requestId, { kind: 'ping', echoes: [] }, true)
      return
    }
    NetworkRuntimes.putSession(ctx, session)
    this.sendNext(ctx, session)
  }

  onTimer(ctx: DeviceContext, session: PingSession, timer: NetworkTimer): void {
    if (timer.kind === 'nextEcho') {
      if (session.awaiting === null && session.sent < session.count) this.sendNext(ctx, session)
      return
    }
    const awaiting = session.awaiting
    if (awaiting?.sequence !== timer.sequence) return
    const event = ctx.openEvent({ flowId: session.requestId, protocol: 'icmp' })
    event.note(3, 'in', L3Notes.of('echoTimeout', { sequence: awaiting.sequence, ms: SIM_TIMING.echoTimeoutMs }))
    event.conclude('timedOut', 3, 'requestTimedOut')
    this.record(ctx, session, { kind: 'timeout', sequence: awaiting.sequence, requestPduId: awaiting.pduId }, 0)
  }

  /** An echo reply for this session: true when it was the awaited one. */
  onEchoReply(ctx: DeviceContext, session: PingSession, reply: Ipv4Packet, echo: IcmpEcho): boolean {
    const awaiting = session.awaiting
    if (awaiting?.sequence !== echo.sequence) return false
    const result: EchoResult = {
      kind: 'reply',
      sequence: awaiting.sequence,
      requestPduId: awaiting.pduId,
      fromIp: reply.src,
      ttl: reply.ttl,
      bytes: echo.dataBytes,
      rttMs: ctx.now - awaiting.sentAt,
    }
    this.record(ctx, session, result, SIM_TIMING.echoIntervalMs)
    return true
  }

  /** Destination unreachable / time exceeded about the awaited echo (`local`: own ARP failed, Windows reports from its own address). */
  onError(ctx: DeviceContext, session: PingSession, fromIp: string, error: IcmpError): boolean {
    const awaiting = session.awaiting
    const quoted = EchoProbes.quotedEcho(error)
    if (!awaiting || quoted?.sequence !== awaiting.sequence) return false
    const base = { sequence: awaiting.sequence, requestPduId: awaiting.pduId, fromIp }
    const result: EchoResult = error.type === 'timeExceeded' ? { kind: 'ttlExpired', ...base } : { kind: 'unreachable', ...base, code: error.code }
    this.record(ctx, session, result, SIM_TIMING.echoIntervalMs)
    return true
  }

  private sendNext(ctx: DeviceContext, previous: PingSession): void {
    const sequence = previous.sent + 1
    const ids = ctx.newPdu(previous.requestId)
    // Saved before sending: a packet to an own address is answered within this call.
    const session: PingSession = { ...previous, sent: sequence, awaiting: { sequence, sentAt: ctx.now, pduId: ids.pduId } }
    NetworkRuntimes.putSession(ctx, session)
    ctx.schedule(SIM_TIMING.echoTimeoutMs, { layer: 'network', kind: 'echoTimeout', requestId: session.requestId, sequence })
    const payload: IcmpEcho = { kind: 'icmp', type: 'echoRequest', identifier: session.identifier, sequence, dataBytes: session.size }
    const sent = this.sender.send(ctx, { ids, dst: session.targetIp, ttl: session.ttl, payload }, [
      L3Notes.of('echoRequestCreated', { sequence, dst: session.targetIp }),
    ])
    if (sent.ok) return
    const current = NetworkRuntimes.session(ctx, session.requestId)
    if (current?.kind !== 'ping' || current.awaiting?.sequence !== sequence) return
    const refusal = EchoProbes.classifyRefusal(ctx, session.targetIp, sent.reason)
    if (refusal.kind === 'silent') return
    const result: EchoResult =
      refusal.kind === 'unreachable'
        ? { kind: 'unreachable', sequence, requestPduId: ids.pduId, fromIp: refusal.fromIp, code: 'host' }
        : { kind: 'localFailure', sequence, reason: refusal.reason }
    this.record(ctx, current, result, SIM_TIMING.echoIntervalMs)
  }

  /** Stores one echo's result, reports, and goes on (`nextInMs` 0 = at once) or finishes. */
  private record(ctx: DeviceContext, session: PingSession, result: EchoResult, nextInMs: number): void {
    const echoes = [...(session.echoes ?? []), result]
    const updated: PingSession = { ...session, awaiting: null, echoes }
    const done = updated.sent >= updated.count
    if (done) NetworkRuntimes.removeSession(ctx, session.requestId)
    else NetworkRuntimes.putSession(ctx, updated)
    ctx.report(session.requestId, { kind: 'ping', echoes }, done)
    if (done) return
    if (nextInMs === 0) this.sendNext(ctx, updated)
    else ctx.schedule(nextInMs, { layer: 'network', kind: 'nextEcho', requestId: session.requestId })
  }
}
