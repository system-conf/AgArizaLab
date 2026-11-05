// Shared network model. This file is the contract between engine, scenarios and UI.
// Do not change field names without updating docs/PLAN.md and every consumer.

export type DeviceKind =
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

export type IpMode = 'static' | 'dhcp'

/** IP settings of an end device (pc, pos, printer, camera, nvr, kitchenDisplay, phone). */
export interface HostNetworkConfig {
  mode: IpMode
  /** Current address; '' when the device has no address. */
  ip: string
  mask: string
  gateway: string
  /** Primary first. Empty array = no DNS configured. */
  dns: string[]
}

export type SwitchPortMode = 'access' | 'trunk'

export interface SwitchPort {
  /** e.g. 'Fa0/1' */
  id: string
  /** Access VLAN. Ignored when mode is 'trunk' (trunk carries every VLAN). */
  vlan: number
  mode: SwitchPortMode
  enabled: boolean
  poe: boolean
}

/** One routed interface on the router's LAN side (router-on-a-stick sub-interface). */
export interface RouterInterface {
  /** e.g. 'LAN.10' */
  id: string
  /** 802.1Q VLAN this interface serves. */
  vlan: number
  ip: string
  mask: string
}

export interface DhcpLease {
  mac: string
  ip: string
}

export interface DhcpPool {
  id: string
  vlan: number
  rangeStart: string
  rangeEnd: string
  mask: string
  gateway: string
  dns: string[]
  leases: DhcpLease[]
}

export interface WirelessNetwork {
  ssid: string
  vlan: number
}

/**
 * An application-level dependency of a device on another address,
 * e.g. a PC's printer address or an NVR's camera list.
 */
export interface AppLink {
  id: string
  /** Turkish label shown in the UI, e.g. 'Yazıcı' or 'Kamera 3'. */
  label: string
  targetIp: string
  targetKind: DeviceKind
}

export interface MapPosition {
  /** 0..1000 */
  x: number
  /** 0..600 */
  y: number
}

export interface Device {
  id: string
  kind: DeviceKind
  /** Turkish display name, e.g. 'Kasa (POS)'. */
  name: string
  mac: string
  position: MapPosition
  powered: boolean
  /** End devices only. */
  host?: HostNetworkConfig
  /** Switch only. */
  switchPorts?: SwitchPort[]
  /** Router only. */
  routerInterfaces?: RouterInterface[]
  /** Router only. */
  dhcpPools?: DhcpPool[]
  /** Router only: is the internet (WAN) link up? */
  wanUp?: boolean
  /** Router only: does the router answer DNS queries (forwarder)? */
  dnsForwarding?: boolean
  /** Access point only. */
  wirelessNetworks?: WirelessNetwork[]
  appLinks?: AppLink[]
}

/**
 * Port ids: hosts use 'eth0' (wired) or 'wlan0' (wireless);
 * switches use their SwitchPort.id; routers use 'lan' (carries all VLANs, like a trunk) or 'wan';
 * access points use 'uplink' (wired, trunk-like) or 'radio' (wireless side);
 * the 'internet' device uses 'wan' (linked to the router's 'wan').
 */
export interface LinkEnd {
  deviceId: string
  portId: string
}

export interface Link {
  id: string
  a: LinkEnd
  b: LinkEnd
  /** false = cable unplugged. */
  connected: boolean
  /** Set for wireless links: the SSID the client joined (decides the VLAN). */
  ssid?: string
}

export interface NetworkState {
  devices: Device[]
  links: Link[]
}
