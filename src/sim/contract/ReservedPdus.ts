// Reserved PDU slots for the protocol packs (docs/SIMULATION.md §9), the PDU counterpart of the lab
// model's `never` keys (MODEL_V2 §8). Each alias is `never` today, so it adds nothing to the unions it
// appears in. The pack that implements the protocol replaces `never` with its interface; every
// exhaustive `switch` over the union then fails to compile until it handles the new member (intended).

/** Pack 5.1: 802.1D / RSTP / PVST+ BPDU (LLC frame to 01:80:C2:00:00:00, or PVST+ SNAP). */
export type StpBpdu = never
/** Pack 5.1: CDP advertisement (SNAP frame to 01:00:0C:CC:CC:CC). */
export type CdpAdvertisement = never
/** Pack 5.1: LLDP advertisement (EtherType 0x88CC). */
export type LldpAdvertisement = never
/** Pack 5.1: EtherChannel negotiation (LACP, slow protocols 0x8809; PAgP over SNAP). */
export type LacpPdu = never
export type PagpPdu = never
/** Pack 5.8: DTP and VTP (SNAP frames to 01:00:0C:CC:CC:CC). */
export type DtpPdu = never
export type VtpPdu = never
/** Pack 5.4: IPv6 packet (EtherType 0x86DD) with ICMPv6 / NDP inside. */
export type Ipv6Packet = never
/** Pack 5.3: OSPF (IP protocol 89) and EIGRP (IP protocol 88). */
export type OspfPacket = never
export type EigrpPacket = never
/** Pack 5.3: RIPv2 (UDP 520) and HSRP (UDP 1985). */
export type RipMessage = never
export type HsrpMessage = never
/** Pack 5.7: PPP frame on serial links (HDLC is simulated today), GRE / IPsec payloads. */
export type PppFrame = never
export type GrePacket = never
/** Pack 5.5: further application payloads (FTP, TFTP, SMTP, POP3, Syslog, NTP, SNMP, Telnet / SSH). */
export type ServerAppPayload = never
