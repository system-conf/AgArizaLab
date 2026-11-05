// v2 network services hosted by a device (routers, servers, wireless routers, the internet cloud).
// See docs/MODEL_V2.md §4.

/** Inclusive IPv4 address range. */
export interface AddressRange {
  start: string
  end: string
}

/** A client the server remembers: hardware address → address (kept after `ipconfig /release`). */
export interface DhcpLeaseV2 {
  /** MAC of the client NIC that asked (HostPort.mac). */
  mac: string
  ip: string
}

/**
 * One DHCP pool (`ip dhcp pool <id>`). The pool serves requests arriving on the interface whose
 * subnet contains `network` (IOS semantics; also how a relayed request is matched later).
 */
export interface DhcpPoolV2 {
  /** Pool name, unique on the device. */
  id: string
  /** `network <network> <mask>`: subnet the pool serves; also the mask handed to clients. */
  network: string
  mask: string
  /**
   * Optional allocation window inside the network (server / home-router style "start address +
   * max users"). Absent = every host address of the network. Exclusions still apply.
   */
  range?: AddressRange
  /** `default-router`; '' = none. */
  defaultRouter: string
  /** `dns-server`, primary first. */
  dnsServers: string[]
  leases: DhcpLeaseV2[]
}

export interface DhcpServerSettings {
  /** Service switch (`service dhcp` / server "DHCP on"). */
  enabled: boolean
  pools: DhcpPoolV2[]
  /** Device-wide exclusions (`ip dhcp excluded-address <start> [<end>]`). */
  excludedRanges: AddressRange[]
}

/** Static DNS record. The server pack 5.5 adds CNAME, MX, NS… as further union members. */
export interface DnsARecord {
  type: 'A'
  /** Host name, lower case, e.g. 'intranet.local'. */
  name: string
  address: string
}

export type DnsRecord = DnsARecord

/**
 * DNS service: answers from `records`, otherwise forwards to `forwarders` in order
 * (router `ip dns server` + `ip name-server`, or a DNS server device).
 */
export interface DnsServerSettings {
  enabled: boolean
  /** Upstream resolvers, primary first; [] = answer from `records` only. */
  forwarders: string[]
  records: DnsRecord[]
}

/** Services a device runs. Reserved keys (`never`) are typed by the server pack 5.5. */
export interface DeviceServices {
  dhcp?: DhcpServerSettings
  dns?: DnsServerSettings
  http?: never
  ftp?: never
  tftp?: never
  email?: never
  syslog?: never
  ntp?: never
  aaa?: never
}

/**
 * One internet service line of the cloud device, attached to one of its ports. A router has
 * internet access when its WAN port is cabled to such a port and the line is up (MODEL_V2 §5).
 */
export interface IspHandoff {
  /** Port of the cloud device. */
  portId: string
  /** false = provider outage: the cable and link light stay up, but no traffic passes. */
  serviceUp: boolean
  /** Reserved for the WAN packs: customer addressing (ISP DHCP, PPPoE credentials, static block). */
  customerAddressing?: never
}

/** Settings of the 'internet' cloud device. A cloud port without a handoff entry provides service. */
export interface InternetSettings {
  handoffs: IspHandoff[]
}
