import type { FailureReason, ReachResult } from '../domain'

/** A router that forwarded the packet, with the address it answers tracert from (the ingress interface). */
export interface RouterHop {
  deviceId: string
  ip: string
}

/**
 * Reach result plus how the packet travelled (map animation, ping and tracert output).
 * ok → `reached` equals the result path; !ok → source up to the device that dropped it.
 */
export interface ReachTrace {
  result: ReachResult
  reached: string[]
  /** Routers in forwarding order. With a loop: up to (excluding) the first repeated router. */
  routerHops: RouterHop[]
  /** Address the packet was sent from ('' when the sender has no usable one). */
  sourceIp: string
  /** ttlExpired: `routerHops` repeat from this index forever. */
  loopStart?: number
  /** ttlExpired: address of the router where the TTL ran out. */
  expiredAtIp?: string
  /**
   * !ok: no answer reaches the sender although the reason would normally produce an ICMP error: the
   * destination is a network / broadcast address, or the reporting router has no route back to the
   * sender (the error is lost). Ping and tracert time out.
   */
  silent?: boolean
}

/** The part of a journey every result carries. */
export interface Journey {
  reached: string[]
  routerHops: RouterHop[]
  sourceIp: string
}

export class ReachTraces {
  static success(journey: Journey): ReachTrace {
    return { ...journey, result: { ok: true, path: journey.reached } }
  }

  static failure(reason: FailureReason, atDeviceId: string, journey: Journey): ReachTrace {
    return { ...journey, result: { ok: false, reason, atDeviceId } }
  }

  /** Failure before the packet left the sender. */
  static atSource(reason: FailureReason, deviceId: string, sourceIp = ''): ReachTrace {
    return ReachTraces.failure(reason, deviceId, { reached: [deviceId], routerHops: [], sourceIp })
  }

  /** The n-th router (0-based) a looping packet meets: the hops up to the loop, then the loop forever. */
  static hopAt(trace: Pick<ReachTrace, 'routerHops' | 'loopStart'>, index: number): RouterHop | undefined {
    const { routerHops, loopStart } = trace
    if (index < routerHops.length || loopStart === undefined) return routerHops[index]
    const cycle = routerHops.length - loopStart
    return cycle > 0 ? routerHops[loopStart + ((index - loopStart) % cycle)] : undefined
  }
}
