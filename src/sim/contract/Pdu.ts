// Protocol data units of the packet simulator (docs/SIMULATION.md §2). Plain, immutable,
// JSON-serializable objects: addresses are text like in the lab model (MAC 'AA:BB:CC:DD:EE:FF' upper
// case, IPv4 dotted), no class instances, no Maps. Header fields that follow from the payload
// (EtherType, IP protocol number, ICMP type / code numbers, BOOTP op) are not stored, so they can never
// disagree with it: read them through PduLayers.
import type {
  CdpAdvertisement,
  DtpPdu,
  EigrpPacket,
  GrePacket,
  HsrpMessage,
  Ipv6Packet,
  LacpPdu,
  LldpAdvertisement,
  OspfPacket,
  PagpPdu,
  PppFrame,
  RipMessage,
  ServerAppPayload,
  StpBpdu,
  VtpPdu,
} from './ReservedPdus'

export const BROADCAST_MAC = 'FF:FF:FF:FF:FF:FF'
/** Target MAC of an ARP request. */
export const ZERO_MAC = '00:00:00:00:00:00'
export const LIMITED_BROADCAST_IP = '255.255.255.255'
/** Source of a DHCP client without an address and sender IP of an ARP probe. */
export const UNSPECIFIED_IP = '0.0.0.0'

// ---------------------------------------------------------------- layer 2

/** 802.1Q tag. `pcp` = priority code point 0..7 (0 unless QoS sets it, pack 5.8). */
export interface Dot1QTag {
  readonly vid: number
  readonly pcp: number
}

/** Ethernet II frame; also used for Wi-Fi between a client and its access point (802.11 is not modelled). */
export interface EthernetFrame {
  readonly kind: 'ethernet'
  readonly src: string
  readonly dst: string
  /** Present = tagged (outer EtherType 0x8100); the inner EtherType follows from the payload. */
  readonly tag?: Dot1QTag
  readonly payload: EthernetPayload
}

export type EthernetPayload =
  | ArpPacket
  | Ipv4Packet
  | Ipv6Packet
  | StpBpdu
  | CdpAdvertisement
  | LldpAdvertisement
  | LacpPdu
  | PagpPdu
  | DtpPdu
  | VtpPdu

/** Cisco HDLC on a serial link: point to point, no MAC addresses, no ARP. */
export interface HdlcFrame {
  readonly kind: 'hdlc'
  readonly payload: Ipv4Packet | Ipv6Packet | CdpAdvertisement
}

/** What travels on a wire between two ports. */
export type WireFrame = EthernetFrame | HdlcFrame | PppFrame

/**
 * ARP (RFC 826). Request: `targetMac` = ZERO_MAC, sent to BROADCAST_MAC. Probe (duplicate address
 * detection, RFC 5227): `senderIp` = UNSPECIFIED_IP. Gratuitous: `senderIp` = `targetIp`.
 */
export interface ArpPacket {
  readonly kind: 'arp'
  readonly operation: 'request' | 'reply'
  readonly senderMac: string
  readonly senderIp: string
  readonly targetMac: string
  readonly targetIp: string
}

// ---------------------------------------------------------------- layer 3

/** IPv4 header without options and fragmentation (the lab never fragments). */
export interface Ipv4Packet {
  readonly kind: 'ipv4'
  readonly src: string
  readonly dst: string
  readonly ttl: number
  /** Identification field, 0..65535: a per-device counter (DeviceRuntime.network.ipIdentification). */
  readonly identification: number
  readonly payload: Ipv4Payload
}

export type Ipv4Payload = IcmpMessage | UdpDatagram | TcpSegment | OspfPacket | EigrpPacket | GrePacket

/** Destination unreachable codes: 0 net, 1 host, 2 protocol, 3 port, 13 administratively prohibited (ACL). */
export type IcmpUnreachableCode = 'net' | 'host' | 'protocol' | 'port' | 'adminProhibited'

/** Echo request (type 8) / echo reply (type 0). */
export interface IcmpEcho {
  readonly kind: 'icmp'
  readonly type: 'echoRequest' | 'echoReply'
  readonly identifier: number
  readonly sequence: number
  /** Data bytes (ping -l), 32 by default on Windows. */
  readonly dataBytes: number
}

/** Type 3. */
export interface IcmpDestinationUnreachable {
  readonly kind: 'icmp'
  readonly type: 'destinationUnreachable'
  readonly code: IcmpUnreachableCode
  readonly original: IpQuote
}

/** Type 11 code 0 (TTL exceeded in transit). Fragment reassembly (code 1) is never simulated. */
export interface IcmpTimeExceeded {
  readonly kind: 'icmp'
  readonly type: 'timeExceeded'
  readonly code: 'ttlInTransit'
  readonly original: IpQuote
}

export type IcmpError = IcmpDestinationUnreachable | IcmpTimeExceeded
export type IcmpMessage = IcmpEcho | IcmpError

/** First bytes of the packet an ICMP error refers to: IP header + 8 bytes of transport (RFC 792). */
export interface IpQuote {
  readonly src: string
  readonly dst: string
  readonly ttl: number
  readonly identification: number
  /**
   * IPv4 total length of the quoted packet in bytes (header + payload), as its header said. Always set
   * by the simulator (`PduLayers.quote`); absent only in hand-made fixtures (the .pcap then writes header + 8).
   */
  readonly totalLength?: number
  readonly transport: TransportQuote
}

export type TransportQuote =
  | { readonly kind: 'icmp'; readonly type: IcmpEcho['type']; readonly identifier: number; readonly sequence: number }
  | { readonly kind: 'udp' | 'tcp'; readonly srcPort: number; readonly dstPort: number }
  /** A protocol pack's payload; only the IP header is quoted. */
  | { readonly kind: 'other' }

// ---------------------------------------------------------------- layer 4

export interface UdpDatagram {
  readonly kind: 'udp'
  readonly srcPort: number
  readonly dstPort: number
  readonly payload: UdpPayload
}

/** Opaque application bytes (a protocol the lab does not decode). */
export interface RawData {
  readonly kind: 'data'
  readonly bytes: number
}

export type UdpPayload = DhcpMessage | DnsMessage | RawData | RipMessage | HsrpMessage | ServerAppPayload

export type TcpFlag = 'syn' | 'ack' | 'fin' | 'rst' | 'psh'

/** Minimal TCP: ports, flags and optional sequence numbers; no windows, options or retransmission. */
export interface TcpSegment {
  readonly kind: 'tcp'
  readonly srcPort: number
  readonly dstPort: number
  /** In the order syn, ack, fin, rst, psh (helps comparing segments). */
  readonly flags: readonly TcpFlag[]
  readonly seq?: number
  readonly ack?: number
  readonly payload: HttpMessage | RawData | ServerAppPayload | null
}

// ---------------------------------------------------------------- application

export type DhcpMessageType = 'discover' | 'offer' | 'request' | 'decline' | 'ack' | 'nak' | 'release' | 'inform'

/** DHCP options the lab uses (RFC 2132 numbers in comments). Absent = option not present. */
export interface DhcpOptions {
  /** 1 */
  readonly subnetMask?: string
  /** 3 */
  readonly routers?: readonly string[]
  /** 6 */
  readonly dnsServers?: readonly string[]
  /** 12 */
  readonly hostName?: string
  /** 50 */
  readonly requestedIp?: string
  /** 51, seconds */
  readonly leaseSeconds?: number
  /** 54 */
  readonly serverIdentifier?: string
  /** 56 (NAK reason, plain text as on the wire) */
  readonly message?: string
}

/** DHCP over BOOTP (RFC 2131). The message type is option 53; `op` follows from it (PduLayers.dhcpOp). */
export interface DhcpMessage {
  readonly kind: 'dhcp'
  readonly messageType: DhcpMessageType
  /** xid, 32-bit, chosen by the client from the seeded RNG. */
  readonly transactionId: number
  /** chaddr */
  readonly clientMac: string
  /** ciaddr */
  readonly clientIp: string
  /** yiaddr */
  readonly yourIp: string
  /** siaddr */
  readonly serverIp: string
  /** giaddr: relay agent address (`ip helper-address`), UNSPECIFIED_IP when not relayed. */
  readonly relayIp: string
  /** Broadcast flag: the client cannot receive unicast before it has an address. */
  readonly broadcast: boolean
  readonly options: DhcpOptions
}

/** Record types the lab answers. The server pack 5.5 adds CNAME, MX, NS… */
export type DnsRecordType = 'A'

export type DnsResponseCode = 'noError' | 'formatError' | 'serverFailure' | 'nameError' | 'refused'

export interface DnsQuestion {
  readonly name: string
  readonly type: DnsRecordType
}

export interface DnsAnswer {
  readonly name: string
  readonly type: 'A'
  readonly ttlSeconds: number
  readonly address: string
}

export interface DnsMessage {
  readonly kind: 'dns'
  readonly id: number
  /** QR bit: false = query, true = response. */
  readonly response: boolean
  readonly recursionDesired: boolean
  readonly recursionAvailable: boolean
  readonly authoritative: boolean
  /** 'nameError' = NXDOMAIN. */
  readonly responseCode: DnsResponseCode
  readonly questions: readonly DnsQuestion[]
  readonly answers: readonly DnsAnswer[]
}

export interface HttpRequest {
  readonly kind: 'http'
  readonly message: 'request'
  readonly method: 'GET'
  readonly host: string
  readonly path: string
}

export interface HttpResponse {
  readonly kind: 'http'
  readonly message: 'response'
  readonly status: number
  readonly contentBytes: number
}

export type HttpMessage = HttpRequest | HttpResponse

/**
 * Anything the event list and the inspector show: a frame on a wire, or an IPv4 packet that has no
 * frame yet (created and buffered while ARP resolves, or refused before it was framed).
 */
export type Pdu = WireFrame | Ipv4Packet
