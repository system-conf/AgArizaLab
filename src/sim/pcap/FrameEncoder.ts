// Real bytes of every modelled PDU (docs/BACKLOG.md item 4): Ethernet II with optional 802.1Q tag, ARP,
// IPv4 with header checksum, ICMP, UDP and minimal TCP with checksums; application payloads in
// ApplicationEncoder. Derived numbers (EtherType, protocol, ICMP type / code, BOOTP op) come from PduLayers.
import type {
  ArpPacket,
  EthernetFrame,
  IcmpMessage,
  IpQuote,
  Ipv4Packet,
  TcpFlag,
  TcpSegment,
  TransportQuote,
  UdpDatagram,
} from '../contract/Pdu'
import { PduLayers } from '../contract/PduLayers'
import { ApplicationEncoder } from './ApplicationEncoder'
import { ByteWriter } from './ByteWriter'
import { InternetChecksum } from './InternetChecksum'

/** Smallest Ethernet frame without FCS (64 on the wire); tagged frames are 4 bytes longer. */
const MIN_ETHERNET_BYTES = 60
const IPV4_HEADER_BYTES = 20
const TCP_FLAG_BITS: Readonly<Record<TcpFlag, number>> = { fin: 0x01, syn: 0x02, rst: 0x04, psh: 0x08, ack: 0x10 }
const TCP_WINDOW = 64_240
/** Windows ping fills the echo data with this alphabet. */
const ECHO_PATTERN = 'abcdefghijklmnopqrstuvw'

export class FrameEncoder {
  /** An Ethernet II frame (802.1Q tagged when `tag` is set), padded to the minimum frame size. */
  static ethernet(frame: EthernetFrame): Uint8Array {
    const out = new ByteWriter().mac(frame.dst).mac(frame.src)
    if (frame.tag) out.u16(0x8100).u16(((frame.tag.pcp & 0x7) << 13) | (frame.tag.vid & 0x0fff))
    out.u16(PduLayers.etherType(frame.payload))
    const payload = frame.payload
    switch (payload.kind) {
      case 'arp':
        out.raw(FrameEncoder.arp(payload))
        break
      case 'ipv4':
        out.raw(FrameEncoder.ipv4(payload))
        break
    }
    const minimum = MIN_ETHERNET_BYTES + (frame.tag ? 4 : 0)
    if (out.length < minimum) out.zeros(minimum - out.length)
    return out.toBytes()
  }

  static arp(packet: ArpPacket): Uint8Array {
    return new ByteWriter()
      .u16(1) // hardware: Ethernet
      .u16(0x0800) // protocol: IPv4
      .u8(6)
      .u8(4)
      .u16(packet.operation === 'request' ? 1 : 2)
      .mac(packet.senderMac)
      .ipv4(packet.senderIp)
      .mac(packet.targetMac)
      .ipv4(packet.targetIp)
      .toBytes()
  }

  static ipv4(packet: Ipv4Packet): Uint8Array {
    const payload = FrameEncoder.transport(packet)
    const header = FrameEncoder.ipv4Header({
      src: packet.src,
      dst: packet.dst,
      ttl: packet.ttl,
      identification: packet.identification,
      protocol: PduLayers.ipProtocol(packet.payload),
      totalLength: IPV4_HEADER_BYTES + payload.length,
    })
    return new ByteWriter().raw(header).raw(payload).toBytes()
  }

  /** IPv4 total length of a packet in bytes (what an ICMP error quotes as `IpQuote.totalLength`). */
  static ipv4Length(packet: Ipv4Packet): number {
    return IPV4_HEADER_BYTES + FrameEncoder.transport(packet).length
  }

  /** 20-byte IPv4 header (no options, no fragmentation) with its checksum. */
  static ipv4Header(fields: { src: string; dst: string; ttl: number; identification: number; protocol: number; totalLength: number }): Uint8Array {
    const out = new ByteWriter()
      .u8(0x45) // version 4, IHL 5
      .u8(0) // DSCP / ECN
      .u16(fields.totalLength)
      .u16(fields.identification)
      .u16(0) // flags, fragment offset
      .u8(fields.ttl)
      .u8(fields.protocol)
      .u16(0) // checksum, patched below
      .ipv4(fields.src)
      .ipv4(fields.dst)
    out.patchU16(10, InternetChecksum.of(out.toBytes()))
    return out.toBytes()
  }

  private static transport(packet: Ipv4Packet): Uint8Array {
    const payload = packet.payload
    switch (payload.kind) {
      case 'icmp':
        return FrameEncoder.icmp(payload)
      case 'udp':
        return FrameEncoder.udp(packet.src, packet.dst, payload)
      case 'tcp':
        return FrameEncoder.tcp(packet.src, packet.dst, payload)
    }
  }

  static icmp(message: IcmpMessage): Uint8Array {
    const { type, code } = PduLayers.icmpNumbers(message)
    const out = new ByteWriter().u8(type).u8(code).u16(0)
    if ('original' in message) {
      out.u32(0) // unused
      out.raw(FrameEncoder.quote(message.original))
    } else {
      out.u16(message.identifier).u16(message.sequence)
      for (let index = 0; index < message.dataBytes; index += 1) out.u8(ECHO_PATTERN.charCodeAt(index % ECHO_PATTERN.length))
    }
    out.patchU16(2, InternetChecksum.of(out.toBytes()))
    return out.toBytes()
  }

  /** The offending packet's IPv4 header plus the first 8 bytes of its transport header (RFC 792). */
  private static quote(original: IpQuote): Uint8Array {
    const quotedBytes = FrameEncoder.quotedTransport(original.transport, 0).length
    const totalLength = original.totalLength ?? IPV4_HEADER_BYTES + quotedBytes
    const transport = FrameEncoder.quotedTransport(original.transport, totalLength - IPV4_HEADER_BYTES)
    const header = FrameEncoder.ipv4Header({
      src: original.src,
      dst: original.dst,
      ttl: original.ttl,
      identification: original.identification,
      protocol: FrameEncoder.quotedProtocol(original.transport),
      totalLength,
    })
    return new ByteWriter().raw(header).raw(transport).toBytes()
  }

  private static quotedProtocol(transport: TransportQuote): number {
    switch (transport.kind) {
      case 'icmp':
        return 1
      case 'tcp':
        return 6
      case 'udp':
        return 17
      case 'other':
        return 255
    }
  }

  /** `payloadBytes` = the quoted packet's IP payload length (the quoted UDP length field). */
  private static quotedTransport(transport: TransportQuote, payloadBytes: number): Uint8Array {
    const out = new ByteWriter()
    switch (transport.kind) {
      case 'icmp':
        // The quoted echo checksum is unknown (the data is not quoted): written as 0.
        out.u8(transport.type === 'echoRequest' ? 8 : 0).u8(0).u16(0).u16(transport.identifier).u16(transport.sequence)
        break
      case 'udp':
        out.u16(transport.srcPort).u16(transport.dstPort).u16(Math.max(8, payloadBytes)).u16(0)
        break
      case 'tcp':
        out.u16(transport.srcPort).u16(transport.dstPort).u32(0)
        break
      case 'other':
        break
    }
    return out.toBytes()
  }

  static udp(src: string, dst: string, datagram: UdpDatagram): Uint8Array {
    const payload = FrameEncoder.udpPayload(datagram)
    const out = new ByteWriter().u16(datagram.srcPort).u16(datagram.dstPort).u16(8 + payload.length).u16(0).raw(payload)
    const checksum = InternetChecksum.transport(src, dst, 17, out.toBytes())
    // A computed 0 is sent as 0xFFFF (0 means "no checksum" in UDP).
    out.patchU16(6, checksum === 0 ? 0xffff : checksum)
    return out.toBytes()
  }

  private static udpPayload(datagram: UdpDatagram): Uint8Array {
    const payload = datagram.payload
    switch (payload.kind) {
      case 'dhcp':
        return ApplicationEncoder.dhcp(payload)
      case 'dns':
        return ApplicationEncoder.dns(payload)
      case 'data':
        return new Uint8Array(Math.max(0, payload.bytes))
    }
  }

  static tcp(src: string, dst: string, segment: TcpSegment): Uint8Array {
    const payload = FrameEncoder.tcpPayload(segment)
    const flags = segment.flags.reduce((bits, flag) => bits | TCP_FLAG_BITS[flag], 0)
    const out = new ByteWriter()
      .u16(segment.srcPort)
      .u16(segment.dstPort)
      .u32((segment.seq ?? 0) >>> 0)
      .u32((segment.ack ?? 0) >>> 0)
      .u8(5 << 4) // data offset: 5 words, no options
      .u8(flags)
      .u16(TCP_WINDOW)
      .u16(0) // checksum, patched below
      .u16(0) // urgent pointer
      .raw(payload)
    out.patchU16(16, InternetChecksum.transport(src, dst, 6, out.toBytes()))
    return out.toBytes()
  }

  private static tcpPayload(segment: TcpSegment): Uint8Array {
    const payload = segment.payload
    if (payload === null) return new Uint8Array(0)
    return payload.kind === 'http' ? ApplicationEncoder.http(payload) : new Uint8Array(Math.max(0, payload.bytes))
  }
}
