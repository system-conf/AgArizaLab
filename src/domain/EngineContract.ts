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

export interface CommandResult {
  lines: TerminalLine[]
  /** Set when the command changed the network (e.g. 'ipconfig /renew'). */
  nextState?: NetworkState
}

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
}
