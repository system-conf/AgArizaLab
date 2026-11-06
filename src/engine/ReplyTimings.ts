import { Ipv4 } from './Ipv4'

/** TTL and round-trip time a destination answers with (fixed values: deterministic engine). */
export interface ReplyTiming {
  ttl: number
  baseTimeMs: number
}

/** Windows' default TTL; every router on the way decrements it once. */
const DEFAULT_TTL = 128
const LOCAL: ReplyTiming = { ttl: DEFAULT_TTL, baseTimeMs: 1 }
const INTERNET: ReplyTiming = { ttl: 117, baseTimeMs: 14 }

/** Picks the timing by how far the destination is: same segment, behind routers, or the internet. */
export class ReplyTimings {
  /** `routers` = routers between sender and destination (one router: TTL 127, 2 ms). */
  static forRouters(targetIp: string, routers: number): ReplyTiming {
    if (Ipv4.isPublic(targetIp)) return INTERNET
    if (routers === 0) return LOCAL
    return { ttl: DEFAULT_TTL - routers, baseTimeMs: 1 + routers }
  }
}
