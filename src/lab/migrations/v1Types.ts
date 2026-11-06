// The v1 network and exercise model, kept ONLY for what is still stored or authored in it: the five
// exercises in src/scenarios (data in v1 shape, loaded through migrateV1Exercise) and old v1 files
// read by the LabSerializer. The app never uses these types directly; migrate first (MODEL_V2 §11).
// Mirrored by the zod schemas in src/lab/schemas/v1Schemas.ts.

export type V1DeviceKind =
  | 'internet'
  | 'router'
  | 'switch'
  | 'accessPoint'
  | 'pc'
  | 'pos'
  | 'printer'
  | 'camera'
  | 'nvr'
  | 'kitchenDisplay'
  | 'phone'

export type V1IpMode = 'static' | 'dhcp'

/** IP settings of an end device (pc, pos, printer, camera, nvr, kitchenDisplay, phone). */
export interface V1HostNetworkConfig {
  mode: V1IpMode
  /** Current address; '' when the device has no address. */
  ip: string
  mask: string
  gateway: string
  /** Primary first. Empty array = no DNS configured. */
  dns: string[]
}

export type V1SwitchPortMode = 'access' | 'trunk'

export interface V1SwitchPort {
  /** e.g. 'Fa0/1' */
  id: string
  /** Access VLAN. Ignored when mode is 'trunk' (trunk carries every VLAN). */
  vlan: number
  mode: V1SwitchPortMode
  enabled: boolean
  poe: boolean
}

/** One routed interface on the router's LAN side (router-on-a-stick sub-interface). */
export interface V1RouterInterface {
  /** e.g. 'LAN.10' */
  id: string
  /** 802.1Q VLAN this interface serves. */
  vlan: number
  ip: string
  mask: string
}

export interface V1DhcpLease {
  mac: string
  ip: string
}

export interface V1DhcpPool {
  id: string
  vlan: number
  rangeStart: string
  rangeEnd: string
  mask: string
  gateway: string
  dns: string[]
  leases: V1DhcpLease[]
}

export interface V1WirelessNetwork {
  ssid: string
  vlan: number
}

/**
 * An application-level dependency of a device on another address,
 * e.g. a PC's printer address or an NVR's camera list.
 */
export interface V1AppLink {
  id: string
  /** Label shown in the UI (a placeholder = the id in exercise data, localized from `exercises`). */
  label: string
  targetIp: string
  targetKind: V1DeviceKind
}

export interface V1MapPosition {
  /** 0..1000 */
  x: number
  /** 0..600 */
  y: number
}

export interface V1Device {
  id: string
  kind: V1DeviceKind
  /** Display name (a placeholder = the id in exercise data, localized from `exercises`). */
  name: string
  mac: string
  position: V1MapPosition
  powered: boolean
  /** End devices only. */
  host?: V1HostNetworkConfig
  /** Switch only. */
  switchPorts?: V1SwitchPort[]
  /** Router only. */
  routerInterfaces?: V1RouterInterface[]
  /** Router only. */
  dhcpPools?: V1DhcpPool[]
  /** Router only: is the internet (WAN) link up? */
  wanUp?: boolean
  /** Router only: does the router answer DNS queries (forwarder)? */
  dnsForwarding?: boolean
  /** Access point only. */
  wirelessNetworks?: V1WirelessNetwork[]
  appLinks?: V1AppLink[]
}

/**
 * Port ids: hosts use 'eth0' (wired) or 'wlan0' (wireless);
 * switches use their SwitchPort.id; routers use 'lan' (carries all VLANs, like a trunk) or 'wan';
 * access points use 'uplink' (wired, trunk-like) or 'radio' (wireless side);
 * the 'internet' device uses 'wan' (linked to the router's 'wan').
 */
export interface V1LinkEnd {
  deviceId: string
  portId: string
}

export interface V1Link {
  id: string
  a: V1LinkEnd
  b: V1LinkEnd
  /** false = cable unplugged. */
  connected: boolean
  /** Set for wireless links: the SSID the client joined (decides the VLAN). */
  ssid?: string
}

export interface V1NetworkState {
  devices: V1Device[]
  links: V1Link[]
}

export type V1ScenarioSetting = 'restoran' | 'ofis' | 'magaza'

export type V1SolveCondition =
  /** fromDeviceId can ping an internet address (8.8.8.8). */
  | { type: 'internet'; fromDeviceId: string }
  /** fromDeviceId can resolve `name` through its DNS settings. */
  | { type: 'resolves'; fromDeviceId: string; name: string }
  /** fromDeviceId can reach the current IP of toDeviceId. */
  | { type: 'reachable'; fromDeviceId: string; toDeviceId: string }
  /** Every AppLink on deviceId reports ok. */
  | { type: 'appLinksOk'; deviceId: string }

/**
 * Data-only exercise in v1 shape: topology, ids and solve conditions, with NO user-facing text.
 * Texts live in the `exercises` namespace keyed by `id` (docs/I18N.md §5). In `initialState`,
 * `Device.name` and `AppLink.label` are placeholders (the device id / app link id). Every exercise
 * has exactly three hints (`hints.0..2`), so no hint count is stored here.
 */
export interface V1ScenarioDefinition {
  /** camelCase, e.g. 'posGateway'; also the key of the exercise in the `exercises` namespace. */
  id: string
  order: number
  setting: V1ScenarioSetting
  initialState: V1NetworkState
  /** All must hold for the exercise to count as solved. */
  solvedWhen: V1SolveCondition[]
}
