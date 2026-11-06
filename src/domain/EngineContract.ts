// Engine contract: what the UI and exercise checks may ask of a NetworkState (src/engine implements
// it). The engine is pure: it never mutates the state it receives.
import type { LocalizedMessage } from './Messages'
import type { NetworkState } from './NetworkState'

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
  /** Another device uses the same IP; like Windows duplicate address detection, both lose it. */
  | 'ipConflict'
  /** The host IP is the network or broadcast address of its own subnet. */
  | 'invalidHostAddress'
  /** The packet looped between routers until its TTL ran out (tracert shows the loop). */
  | 'ttlExpired'

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

export type TerminalLineKind = 'input' | 'output' | 'error' | 'info'

/**
 * Device text: shown verbatim and never translated (Windows / IOS output stays English in every
 * language; 'input' lines are what the user typed).
 */
export interface TerminalTextLine {
  kind: TerminalLineKind
  text: string
  message?: never
}

/** App message around the device output (help text, "device is off", …): translated by the UI. */
export interface TerminalMessageLine {
  kind: TerminalLineKind
  message: LocalizedMessage
  text?: never
}

/**
 * One terminal line: exactly one of `text` (device output) or `message` (app message).
 * Narrow with `'message' in line` or `line.message !== undefined`.
 */
export type TerminalLine = TerminalTextLine | TerminalMessageLine

/**
 * Route a ping packet took, for the canvas animation.
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
 * Physical link light, like a switch port LED. 'up' = cable connected, both ends powered and
 * enabled, a working cable for the ports. Says nothing about IP/VLAN/DNS, so it never reveals a
 * config fault.
 */
export type LinkLight = 'up' | 'down'

export type DhcpResult =
  | { ok: true; nextState: NetworkState; ip: string }
  | { ok: false; reason: FailureReason }

export interface NetworkEngine {
  /** Can `fromDeviceId` (any device with an L3 address) reach `toIp` (ICMP)? */
  reach(state: NetworkState, fromDeviceId: string, toIp: string): ReachResult
  /** Resolve a host name using the device's configured DNS servers. */
  resolve(state: NetworkState, fromDeviceId: string, name: string): ResolveResult
  /** Status of every AppLink on a device. */
  appLinkStatus(state: NetworkState, deviceId: string): AppLinkStatus[]
  /** DHCP on one NIC (`portId`), or on every NIC of the host in 'dhcp' mode when omitted. */
  renewDhcp(state: NetworkState, deviceId: string, portId?: string): DhcpResult
  /** Run a terminal command line on a host: ipconfig (/all, /renew, /release), ping, tracert, nslookup, help. */
  runCommand(state: NetworkState, deviceId: string, commandLine: string): CommandResult
  /** Physical light of one link. */
  linkLight(state: NetworkState, linkId: string): LinkLight
}
