// Engine contract: what the UI and scenario checks may call.
// The engine is pure: it never mutates the NetworkState it receives.
import type { NetworkState } from './NetworkTypes'

export type FailureReason =
  | 'powerOff'
  | 'cableDisconnected'
  | 'portDisabled'
  | 'noIpAddress'
  | 'invalidConfig'
  | 'destinationNotInSegment'
  | 'gatewayNotSet'
  | 'gatewayOutsideSubnet'
  | 'gatewayUnreachable'
  | 'noRouteToDestination'
  | 'wanDown'
  | 'dnsNotSet'
  | 'dnsUnreachable'
  | 'dnsNoAnswer'
  | 'nameNotFound'
  | 'wrongDeviceAtAddress'
  | 'dhcpNoServer'
  | 'dhcpPoolExhausted'

export type ReachResult =
  | { ok: true; path: string[] }
  | { ok: false; reason: FailureReason; atDeviceId?: string }

export type ResolveResult =
  | { ok: true; ip: string; dnsServer: string }
  | { ok: false; reason: FailureReason; dnsServer?: string }

export interface AppLinkStatus {
  appLinkId: string
  label: string
  targetIp: string
  ok: boolean
  reason?: FailureReason
}

export interface TerminalLine {
  kind: 'input' | 'output' | 'error' | 'info'
  text: string
}

/**
 * Route a ping packet took, for map animation (v1.1).
 * ok: path = full route source → destination (reply goes back the same way).
 * !ok: path = route from source to the device where the packet was dropped (may be just [source]).
 */
export interface PacketTrace {
  path: string[]
  ok: boolean
}

export interface CommandResult {
  lines: TerminalLine[]
  /** Set when the command changed the network (e.g. 'ipconfig /renew'). */
  nextState?: NetworkState
  /** Set by ping (one trace for the whole command; for names, the trace to the resolved IP). */
  trace?: PacketTrace
}

/**
 * Physical link light, like a switch port LED (v1.1). 'up' = cable connected, both ends powered,
 * switch port(s) enabled. Says nothing about IP/VLAN/DNS, so it never reveals a config fault.
 */
export type LinkLight = 'up' | 'down'

export type DhcpResult =
  | { ok: true; nextState: NetworkState; ip: string }
  | { ok: false; reason: FailureReason }

export interface NetworkEngine {
  /** Can `fromDeviceId` reach `toIp` (ICMP)? */
  reach(state: NetworkState, fromDeviceId: string, toIp: string): ReachResult
  /** Resolve a host name using the device's configured DNS servers. */
  resolve(state: NetworkState, fromDeviceId: string, name: string): ResolveResult
  /** Status of every AppLink on a device. */
  appLinkStatus(state: NetworkState, deviceId: string): AppLinkStatus[]
  /** Request an address from the DHCP server in the device's VLAN. */
  renewDhcp(state: NetworkState, deviceId: string): DhcpResult
  /** Run a terminal command line on a host: ipconfig, ipconfig /all, ipconfig /renew, ping, nslookup, help. */
  runCommand(state: NetworkState, deviceId: string, commandLine: string): CommandResult
  /** Physical light of one link (v1.1). */
  linkLight(state: NetworkState, linkId: string): LinkLight
}
