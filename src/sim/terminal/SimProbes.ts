import type { FailureReason, ReachResult, ResolveResult } from '../../domain'
import type { EchoResult, RequestRecord, SimRequest, SimulationEngine } from '../contract'

/** A reach check on the simulator: the result in the engine's terms plus who answered. */
export interface SimReach {
  readonly result: ReachResult
  /** Device of the `replied` / `delivered` event of the echo request (docs/SIMULATION.md §10.1 AppLinks). */
  readonly answeringDeviceId: string | null
}

/** Windows' default echo size. */
const ECHO_BYTES = 32

/** Simulator results that share their name with the engine's FailureReason. */
const SHARED_REASONS: readonly FailureReason[] = [
  'cableDisconnected',
  'portDisabled',
  'noIpAddress',
  'invalidConfig',
  'invalidHostAddress',
  'ipConflict',
  'gatewayNotSet',
  'gatewayOutsideSubnet',
  'ttlExpired',
]

/**
 * Single requests run to their end, for the verify checker and app links (docs/SIMULATION.md §10.1):
 * reach = a one-echo ping gets a reply; resolve = the DNS client's answer.
 */
export class SimProbes {
  static reach(engine: SimulationEngine, deviceId: string, targetIp: string): SimReach {
    const fromEventId = engine.snapshot().counters.event
    const record = SimProbes.runToEnd(engine, { kind: 'ping', deviceId, targetIp, count: 1, size: ECHO_BYTES })
    if (record.aborted) return { result: { ok: false, reason: 'powerOff', atDeviceId: deviceId }, answeringDeviceId: null }
    const echo = record.result?.kind === 'ping' ? record.result.echoes[0] : undefined
    if (echo?.kind !== 'reply') return { result: SimProbes.failure(echo, deviceId), answeringDeviceId: null }
    const answer = engine
      .events(fromEventId)
      .find((event) => event.pduId === echo.requestPduId && (event.action === 'replied' || event.action === 'delivered'))
    return { result: { ok: true, path: [] }, answeringDeviceId: answer?.deviceId ?? null }
  }

  static resolve(engine: SimulationEngine, deviceId: string, name: string): ResolveResult {
    const record = SimProbes.runToEnd(engine, { kind: 'dnsQuery', deviceId, name, useCache: false })
    if (record.result?.kind === 'dns') return record.result.answer
    return { ok: false, reason: record.aborted ? 'powerOff' : 'dnsUnreachable' }
  }

  private static runToEnd(engine: SimulationEngine, request: SimRequest): RequestRecord {
    const requestId = engine.inject(request)
    engine.runUntilDone(requestId)
    const record = engine.request(requestId)
    if (!record) throw new Error(`Request ${requestId} vanished`)
    return record
  }

  /**
   * The closest engine reason for a failed echo (the simulator cannot always tell the engine's reasons
   * apart: an unreachable from the own address is an ARP failure or a gateway problem, a timeout is lost
   * on the way or on the way back).
   */
  private static failure(echo: EchoResult | undefined, deviceId: string): ReachResult {
    switch (echo?.kind) {
      case 'localFailure':
        return { ok: false, reason: SHARED_REASONS.find((reason) => reason === echo.reason) ?? 'invalidConfig', atDeviceId: deviceId }
      case 'unreachable':
        return { ok: false, reason: 'destinationNotInSegment' }
      case 'ttlExpired':
        return { ok: false, reason: 'ttlExpired' }
      default:
        return { ok: false, reason: 'gatewayUnreachable' }
    }
  }
}
