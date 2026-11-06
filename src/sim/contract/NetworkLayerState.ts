// Runtime state and timers of the network layer (S2, docs/SIMULATION.md §4).
// Owner-extensible: S2 may ADD optional fields, session fields and timer members here during wave 3.1.
// RouteEntry is read by Phase 4 (`show ip route`, `route print`): frozen.
import type { EchoResult, TracertHopResult } from './Requests'

/** Route source; dynamic protocols (rip, ospf, eigrp, bgp) are added by pack 5.3 / 5.7. */
export type RouteCode = 'connected' | 'local' | 'static'

/**
 * One entry of the routing table derived from the configuration (S2 rebuilds it on start and on every
 * DeviceChange). Same selection as the rule engine's RoutingTable: connected subnets of up interfaces,
 * `local` /32 host routes of own addresses (shown by IOS; never chosen for forwarding), static routes
 * whose exit interface is up or whose next hop resolves recursively; longest prefix, then lowest
 * administrative distance, then table order. Hosts get connected routes plus a default route via their
 * gateway when the gateway is on-link. CLI.
 */
export interface RouteEntry {
  readonly code: RouteCode
  readonly prefix: string
  readonly mask: string
  readonly prefixLength: number
  readonly adminDistance: number
  readonly metric: number
  /** null = directly connected (deliver on the exit interface's link). */
  readonly nextHop: string | null
  /** L3 interface id; null when only a next hop is configured and it does not resolve (not installed). */
  readonly exitInterfaceId: string | null
}

/** A probe the client waits for. */
export interface AwaitedProbe {
  readonly sequence: number
  readonly sentAt: number
  readonly pduId: string
}

/** `ping` client (Windows semantics: next echo `intervalMs` after a reply or a timeout). */
export interface PingSession {
  readonly kind: 'ping'
  readonly requestId: string
  readonly targetIp: string
  readonly identifier: number
  readonly count: number
  readonly size: number
  readonly ttl: number
  /** Echoes sent so far. */
  readonly sent: number
  readonly awaiting: AwaitedProbe | null
  /** S2: results of the echoes so far, in sequence order (reported with every update). */
  readonly echoes?: readonly EchoResult[]
}

/** `tracert` client: `probesPerHop` echoes per TTL, stops at the destination, an unreachable, `maxHops` or `maxSilentHops`. */
export interface TracertSession {
  readonly kind: 'tracert'
  readonly requestId: string
  readonly targetIp: string
  readonly identifier: number
  /** TTL of the current hop (1-based). */
  readonly hop: number
  /** Probe index inside the hop (0-based). */
  readonly probe: number
  /** Hops in a row without any answer. */
  readonly silentHops: number
  readonly awaiting: AwaitedProbe | null
  /** S2: limits of the request. */
  readonly limits?: TracertLimits
  /** S2: hops so far; the last one may be the hop in progress (`ttl` = `hop`). */
  readonly hops?: readonly TracertHopResult[]
}

/** Limits of a tracert (copied from SimTracertRequest; absent = Windows defaults 30 / 3 / 4). */
export interface TracertLimits {
  readonly maxHops: number
  readonly probesPerHop: number
  readonly maxSilentHops: number
}

export type NetworkSession = PingSession | TracertSession

export interface NetworkRuntime {
  /** CLI */
  readonly routes: readonly RouteEntry[]
  readonly sessions: readonly NetworkSession[]
  /** Next IPv4 identification value (wraps at 65536). */
  readonly ipIdentification: number
  /** Next ICMP echo identifier for a new ping / tracert. */
  readonly echoIdentifier: number
}

/** Timers of the network layer (ping / tracert clients). */
export type NetworkTimer =
  | { readonly layer: 'network'; readonly kind: 'echoTimeout'; readonly requestId: string; readonly sequence: number }
  | { readonly layer: 'network'; readonly kind: 'nextEcho'; readonly requestId: string }
