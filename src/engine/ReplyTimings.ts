import type { NetworkState } from '../domain/NetworkTypes'
import { DeviceLookup } from './DeviceLookup'
import { Ipv4 } from './Ipv4'

/** TTL and round-trip time a destination answers with (fixed values: deterministic engine). */
export interface ReplyTiming {
  ttl: number
  baseTimeMs: number
}

const LOCAL: ReplyTiming = { ttl: 128, baseTimeMs: 1 }
const ROUTED: ReplyTiming = { ttl: 127, baseTimeMs: 2 }
const INTERNET: ReplyTiming = { ttl: 117, baseTimeMs: 14 }

/** Picks the timing by how far the destination is: same segment, behind the router, or the internet. */
export class ReplyTimings {
  static forPath(state: NetworkState, targetIp: string, path: readonly string[]): ReplyTiming {
    if (Ipv4.isPublic(targetIp)) return INTERNET
    const routed = path.slice(1, -1).some((deviceId) => DeviceLookup.find(state, deviceId)?.kind === 'router')
    return routed ? ROUTED : LOCAL
  }
}
