import type { FailureReasonV2, ReachResultV2 } from '../../domain/v2'

/** A router that forwarded the packet, with the address it answers tracert from (the ingress interface). */
export interface RouterHop {
  deviceId: string
  ip: string
}

/**
 * Reach result plus how the packet travelled (map animation, ping and tracert output).
 * ok → `reached` equals the result path; !ok → source up to the device that dropped it.
 */
export interface ReachTraceV2 {
  result: ReachResultV2
  reached: string[]
  /** Routers in forwarding order. With a loop: up to (excluding) the first repeated router. */
  routerHops: RouterHop[]
  /** Address the packet was sent from ('' when the sender has no usable one). */
  sourceIp: string
  /** ttlExpired: `routerHops` repeat from this index forever. */
  loopStart?: number
  /** ttlExpired: address of the router where the TTL ran out. */
  expiredAtIp?: string
}

/** The part of a journey every result carries. */
export interface Journey {
  reached: string[]
  routerHops: RouterHop[]
  sourceIp: string
}

export class ReachTraces {
  static success(journey: Journey): ReachTraceV2 {
    return { ...journey, result: { ok: true, path: journey.reached } }
  }

  static failure(reason: FailureReasonV2, atDeviceId: string, journey: Journey): ReachTraceV2 {
    return { ...journey, result: { ok: false, reason, atDeviceId } }
  }

  /** Failure before the packet left the sender. */
  static atSource(reason: FailureReasonV2, deviceId: string, sourceIp = ''): ReachTraceV2 {
    return ReachTraces.failure(reason, deviceId, { reached: [deviceId], routerHops: [], sourceIp })
  }

  /** The n-th router (0-based) a looping packet meets: the hops up to the loop, then the loop forever. */
  static hopAt(trace: Pick<ReachTraceV2, 'routerHops' | 'loopStart'>, index: number): RouterHop | undefined {
    const { routerHops, loopStart } = trace
    if (index < routerHops.length || loopStart === undefined) return routerHops[index]
    const cycle = routerHops.length - loopStart
    return cycle > 0 ? routerHops[loopStart + ((index - loopStart) % cycle)] : undefined
  }
}
