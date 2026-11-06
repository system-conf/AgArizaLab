// Declarative command tree (docs/CLI.md §3): command sets register keyword trees per mode; the core
// parses, abbreviates, helps, completes and runs them. Handlers are pure: they read the device and the
// simulator's runtime and return a result (a new Device for config changes, never a mutation).
import type { Device, NetworkState, TerminalLine } from '../../domain'
import type { DeviceRuntime, RequestRecord, SimRequest } from '../../sim/contract'
import type { CliMode, CliModeKind } from './CliModes'
import type { CliInterfaceName, CliValue } from './CliValues'
import type { InterfaceConfigContributor, RunningConfigSection } from './RunningConfig'

/** What a parameter accepts. The label is what `?` prints in the left column. */
export type CliParamSpec =
  /** One token without spaces; label default 'WORD'. */
  | { readonly type: 'word'; readonly label?: string }
  /** Integer in [min, max]; label `<min-max>`. */
  | { readonly type: 'number'; readonly min: number; readonly max: number }
  /** Dotted IPv4 address or mask; label 'A.B.C.D'. Masks are checked by the handler (IOS "Bad mask"). */
  | { readonly type: 'ipv4' }
  /** MAC in Cisco dotted form 'aabb.cc00.0100' (other forms accepted, normalized to 'AA:BB:CC:00:01:00'); label 'H.H.H'. */
  | { readonly type: 'mac' }
  /** The rest of the line, raw (inner spaces kept); label 'LINE'. Must be the last node of its branch. */
  | { readonly type: 'line'; readonly label?: string }
  /** One interface: 'g0/0', 'gi 0/0', 'Vlan10', 'Gi0/0.10'; only types the device has are accepted. */
  | { readonly type: 'interface' }
  /** The rest of the line as an interface list: 'fa0/1 - 5 , fa0/7', 'g0/1-2'. */
  | { readonly type: 'interfaceRange' }
  /** VLAN list '10', '10,20,30-35' (1..4094, sorted, unique); label `<1-4094>`. */
  | { readonly type: 'vlanList' }

/** Device filter of a node: false = the node does not exist on this device (not listed, not parsed). */
export type CliWhen = (device: Device) => boolean

/** What a handler reads besides the device. Supplied by the UI for every call. */
export interface CliEnvironment {
  /** The lab's current configuration (links and peers, e.g. for interface status). */
  readonly network: NetworkState
  /** The simulator's runtime of this device (ARP, MAC table, routes, DHCP bindings); undefined = none. */
  readonly runtime: DeviceRuntime | undefined
  /** Virtual time in ms (ages of ARP / MAC entries). */
  readonly now: number
}

/** Typed access to the parameter values of a parsed line. Wrong name or type = programmer error (throws). */
export interface CliArgsReader {
  has(name: string): boolean
  text(name: string): string
  number(name: string): number
  numbers(name: string): readonly number[]
  interface(name: string): CliInterfaceName
  interfaces(name: string): readonly CliInterfaceName[]
  /** Raw value, undefined when the parameter was not given. */
  value(name: string): CliValue | undefined
}

/** Read-only view of the session for handlers (`show history`, `terminal length`). */
export interface CliSessionInfo {
  readonly hostname: string
  readonly terminalLength: number
  /** History of the current mode group (EXEC or config), oldest first. */
  readonly history: readonly string[]
}

export interface CliContext {
  readonly device: Device
  /** Mode the command runs in. In an interface range: the member's `interface` mode. */
  readonly mode: CliMode
  readonly args: CliArgsReader
  /** Canonical keywords of the matched path, e.g. ['show', 'ip', 'route'] (without 'no' / 'do'). */
  readonly path: readonly string[]
  /** The line started with `no`. */
  readonly negated: boolean
  readonly env: CliEnvironment
  readonly session: CliSessionInfo
}

/** Effects on the session itself (core commands only). */
export type CliSessionEffect =
  | { readonly kind: 'terminalLength'; readonly length: number }
  | { readonly kind: 'logout' }
  /** The device was reloaded: the UI restarts its runtime (docs/CLI.md §5.3). */
  | { readonly kind: 'reloaded' }

/** An interactive question ("Destination filename [startup-config]?", "Password:"). */
export interface CliQuestion {
  /** Printed without a line break; the answer is typed after it. */
  readonly prompt: string
  /** Do not echo the answer (passwords). */
  readonly secret: boolean
  /** Called with the typed answer (trimmed of the line break only) and the current context. */
  readonly onAnswer: (answer: string, ctx: CliContext) => CliCommandResult
}

/** A simulator request the command waits for (ping, traceroute, clear arp). The UI runs it. */
export interface CliJob {
  readonly request: SimRequest
  /** Called with the finished record; `ctx` carries the device and runtime of that moment. */
  readonly onDone: (record: RequestRecord, ctx: CliContext) => CliCommandResult
}

/** What a handler returns. Every field is optional; `{}` = the command did nothing visible. */
export interface CliCommandResult {
  /** Device output; build with cliText / cliError / cliLog (src/cli/core/CliOutput). */
  readonly lines?: readonly TerminalLine[]
  /** The changed device (pure edit of ctx.device, see DeviceEdits). */
  readonly device?: Device
  /** Mode after the command (enter a sub-mode, go back). Absent = unchanged. */
  readonly mode?: CliMode
  /** Ask the user first; output and changes so far are applied before the question. */
  readonly ask?: CliQuestion
  /** Wait for a simulator request; ignored together with `ask`. */
  readonly job?: CliJob
  readonly session?: CliSessionEffect
}

export type CliHandler = (ctx: CliContext) => CliCommandResult

interface CliNodeBase {
  /** Right column of `?` (English, IOS style, e.g. 'Show running system information'). */
  readonly help: string
  readonly children?: readonly CliNode[]
  /** Runs when the line ends at this node. */
  readonly run?: CliHandler
  /** Runs when the line starts with `no` and ends at this node. Only nodes with a `no` form are offered after `no`. */
  readonly runNo?: CliHandler
  readonly when?: CliWhen
  /** Parsed but never listed by `?` or completed by Tab (e.g. lines only startup-config replays). */
  readonly hidden?: boolean
}

/** A keyword; matched case-insensitively by any unambiguous prefix ('conf t', 'sh ip int br'). */
export interface CliKeywordNode extends CliNodeBase {
  readonly kind: 'keyword'
  /** Canonical spelling, as IOS prints it ('running-config', 'GigabitEthernet'). */
  readonly word: string
}

/** A value; tried only when no keyword of the same level matches the token. */
export interface CliParamNode extends CliNodeBase {
  readonly kind: 'param'
  /** Key in CliArgsReader. Unique along one path. */
  readonly name: string
  readonly param: CliParamSpec
}

export type CliNode = CliKeywordNode | CliParamNode

/**
 * A top-level command in some modes. Two registrations with the same top keyword in one mode are merged
 * level by level (`show` from several sets); two handlers on the same merged node = programmer error.
 */
export interface CliCommandRegistration {
  readonly modes: readonly CliModeKind[]
  readonly node: CliKeywordNode
}

/** Everything one owner contributes (docs/CLI.md §8): commands plus their running-config output. */
export interface CliCommandSet {
  /** camelCase, unique, e.g. 'core', 'switch', 'router'. */
  readonly id: string
  readonly commands: readonly CliCommandRegistration[]
  readonly configSections?: readonly RunningConfigSection[]
  readonly interfaceLines?: readonly InterfaceConfigContributor[]
}
