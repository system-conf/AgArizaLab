// v2 engine contract (E2 implements it in src/engine). Same questions as v1, asked of a
// NetworkStateV2. Version-independent types (terminal lines, traces, link lights) come from v1's
// EngineContract.ts and move here when v1 is deleted.
import type { FailureReason, LinkLight, PacketTrace, TerminalLine } from '../EngineContract'
import type { NetworkStateV2 } from './NetworkStateV2'

/**
 * v1 reasons plus what static routing makes possible: `ttlExpired` = the packet looped between
 * routers until its TTL ran out (tracert shows the loop).
 */
export type FailureReasonV2 = FailureReason | 'ttlExpired'

export type ReachResultV2 =
  | { ok: true; path: string[] }
  | { ok: false; reason: FailureReasonV2; atDeviceId?: string }

export type ResolveResultV2 =
  | { ok: true; ip: string; dnsServer: string }
  | { ok: false; reason: FailureReasonV2; dnsServer?: string }

export interface AppLinkStatusV2 {
  appLinkId: string
  label: string
  targetIp: string
  ok: boolean
  reason?: FailureReasonV2
}

export interface CommandResultV2 {
  lines: TerminalLine[]
  /** Set when the command changed the network (e.g. 'ipconfig /renew'). */
  nextState?: NetworkStateV2
  trace?: PacketTrace
}

export type DhcpResultV2 =
  | { ok: true; nextState: NetworkStateV2; ip: string }
  | { ok: false; reason: FailureReasonV2 }

/** Pure and stateless like v1: never mutates the state it receives. */
export interface NetworkEngineV2 {
  /** Can `fromDeviceId` (any device with an L3 address) reach `toIp` (ICMP)? */
  reach(state: NetworkStateV2, fromDeviceId: string, toIp: string): ReachResultV2
  resolve(state: NetworkStateV2, fromDeviceId: string, name: string): ResolveResultV2
  appLinkStatus(state: NetworkStateV2, deviceId: string): AppLinkStatusV2[]
  /** DHCP on one NIC (`portId`), or on every NIC of the host in 'dhcp' mode when omitted. */
  renewDhcp(state: NetworkStateV2, deviceId: string, portId?: string): DhcpResultV2
  runCommand(state: NetworkStateV2, deviceId: string, commandLine: string): CommandResultV2
  linkLight(state: NetworkStateV2, linkId: string): LinkLight
}
