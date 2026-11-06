import { describe, expect, it } from 'vitest'
import type { DhcpMessage, DnsMessage, EthernetFrame, Ipv4Packet, Ipv4Payload } from '../contract'
import { FrameEncoder } from './FrameEncoder'
import { InternetChecksum } from './InternetChecksum'
import {
  ByteReader,
  checksumValid,
  readDhcpOptions,
  readDnsName,
  readEthernet,
  readIpv4,
  transportChecksumValid,
} from './PcapTestReader'

const PC1 = '02:00:00:00:00:01'
const PC2 = '02:00:00:00:00:02'

function ip(payload: Ipv4Payload, src = '192.168.1.10', dst = '192.168.1.20'): Ipv4Packet {
  return { kind: 'ipv4', src, dst, ttl: 128, identification: 0x1234, payload }
}

function ether(payload: EthernetFrame['payload'], tag?: EthernetFrame['tag']): EthernetFrame {
  return { kind: 'ethernet', src: PC1, dst: PC2, payload, ...(tag ? { tag } : {}) }
}

function encode(frame: EthernetFrame) {
  return readEthernet(new ByteReader(FrameEncoder.ethernet(frame)))
}

describe('InternetChecksum', () => {
  it('matches the RFC 1071 example and a textbook IPv4 header', () => {
    expect(InternetChecksum.of([0x00, 0x01, 0xf2, 0x03, 0xf4, 0xf5, 0xf6, 0xf7])).toBe(0x220d)
    const header = [0x45, 0, 0, 0x73, 0, 0, 0x40, 0, 0x40, 0x11, 0, 0, 0xc0, 0xa8, 0, 1, 0xc0, 0xa8, 0, 0xc7]
    expect(InternetChecksum.of(header)).toBe(0xb861)
  })

  it('pads an odd last byte with zero', () => {
    expect(InternetChecksum.of([0x12, 0x34, 0x56])).toBe(InternetChecksum.of([0x12, 0x34, 0x56, 0x00]))
  })
})

describe('FrameEncoder', () => {
  it('writes an ARP request in a broadcast frame padded to 60 bytes', () => {
    const bytes = FrameEncoder.ethernet({
      kind: 'ethernet',
      src: PC1,
      dst: 'FF:FF:FF:FF:FF:FF',
      payload: { kind: 'arp', operation: 'request', senderMac: PC1, senderIp: '10.0.0.1', targetMac: '00:00:00:00:00:00', targetIp: '10.0.0.2' },
    })
    expect(bytes.length).toBe(60)
    const frame = readEthernet(new ByteReader(bytes))
    expect(frame).toMatchObject({ dst: 'FF:FF:FF:FF:FF:FF', src: PC1, vlan: null, etherType: 0x0806 })
    const arp = frame.payload
    expect([arp.u16(0), arp.u16(2), arp.u8(4), arp.u8(5), arp.u16(6)]).toEqual([1, 0x0800, 6, 4, 1])
    expect([arp.mac(8), arp.ipv4(14), arp.mac(18), arp.ipv4(24)]).toEqual([PC1, '10.0.0.1', '00:00:00:00:00:00', '10.0.0.2'])
  })

  it('writes an 802.1Q tag with VLAN id and priority', () => {
    const frame = encode(ether({ kind: 'arp', operation: 'reply', senderMac: PC1, senderIp: '10.0.0.1', targetMac: PC2, targetIp: '10.0.0.2' }, { vid: 20, pcp: 5 }))
    expect(frame.vlan).toEqual({ vid: 20, pcp: 5 })
    expect(frame.etherType).toBe(0x0806)
    expect(frame.payload.u16(6)).toBe(2)
  })

  it('writes an ICMP echo request with valid IPv4 and ICMP checksums and the Windows data pattern', () => {
    const frame = encode(ether(ip({ kind: 'icmp', type: 'echoRequest', identifier: 1, sequence: 7, dataBytes: 32 })))
    expect(frame.etherType).toBe(0x0800)
    const packet = readIpv4(frame.payload)
    expect(packet).toMatchObject({ versionIhl: 0x45, totalLength: 60, identification: 0x1234, ttl: 128, protocol: 1, src: '192.168.1.10', dst: '192.168.1.20', headerValid: true })
    const icmp = packet.payload
    expect([icmp.u8(0), icmp.u8(1), icmp.u16(4), icmp.u16(6)]).toEqual([8, 0, 1, 7])
    expect(icmp.text(8, 32)).toBe('abcdefghijklmnopqrstuvwabcdefghi')
    expect(checksumValid(icmp.bytes)).toBe(true)
  })

  it('quotes the offending header and 8 transport bytes in ICMP errors', () => {
    const error = ip(
      {
        kind: 'icmp',
        type: 'destinationUnreachable',
        code: 'port',
        original: { src: '192.168.1.20', dst: '192.168.1.10', ttl: 127, identification: 9, totalLength: 28, transport: { kind: 'udp', srcPort: 50000, dstPort: 53 } },
      },
      '192.168.1.10',
      '192.168.1.20',
    )
    const icmp = readIpv4(encode(ether(error)).payload).payload
    expect([icmp.u8(0), icmp.u8(1)]).toEqual([3, 3])
    expect(checksumValid(icmp.bytes)).toBe(true)
    const quoted = readIpv4(icmp.slice(8))
    expect(quoted).toMatchObject({ protocol: 17, src: '192.168.1.20', dst: '192.168.1.10', ttl: 127, totalLength: 28, headerValid: true })
    expect([quoted.payload.u16(0), quoted.payload.u16(2)]).toEqual([50000, 53])
  })

  it('writes time exceeded as type 11 code 0', () => {
    const exceeded = ip({ kind: 'icmp', type: 'timeExceeded', code: 'ttlInTransit', original: { src: '1.1.1.1', dst: '8.8.8.8', ttl: 1, identification: 1, totalLength: 60, transport: { kind: 'icmp', type: 'echoRequest', identifier: 1, sequence: 1 } } })
    const icmp = readIpv4(encode(ether(exceeded)).payload).payload
    expect([icmp.u8(0), icmp.u8(1)]).toEqual([11, 0])
    expect(readIpv4(icmp.slice(8)).protocol).toBe(1)
  })

  it('writes UDP with a valid pseudo-header checksum and raw data', () => {
    const packet = readIpv4(encode(ether(ip({ kind: 'udp', srcPort: 1234, dstPort: 9999, payload: { kind: 'data', bytes: 5 } }))).payload)
    expect(packet.protocol).toBe(17)
    const udp = packet.payload
    expect([udp.u16(0), udp.u16(2), udp.u16(4)]).toEqual([1234, 9999, 13])
    expect(transportChecksumValid(packet.src, packet.dst, 17, udp.bytes)).toBe(true)
  })

  it('writes TCP flags, sequence numbers and a valid checksum', () => {
    const packet = readIpv4(encode(ether(ip({ kind: 'tcp', srcPort: 49152, dstPort: 80, flags: ['syn', 'ack'], seq: 1000, ack: 77, payload: null }))).payload)
    const tcp = packet.payload
    expect([tcp.u16(0), tcp.u16(2), tcp.u32(4), tcp.u32(8), tcp.u8(12) >> 4, tcp.u8(13)]).toEqual([49152, 80, 1000, 77, 5, 0x12])
    expect(tcp.bytes.length).toBe(20)
    expect(transportChecksumValid(packet.src, packet.dst, 6, tcp.bytes)).toBe(true)
  })

  it('writes HTTP request and response text over TCP', () => {
    const request = readIpv4(
      encode(ether(ip({ kind: 'tcp', srcPort: 49152, dstPort: 80, flags: ['ack', 'psh'], payload: { kind: 'http', message: 'request', method: 'GET', host: 'google.com', path: '/' } }))).payload,
    )
    expect(request.payload.text(20, request.payload.bytes.length - 20)).toBe('GET / HTTP/1.0\r\nHost: google.com\r\n\r\n')
    expect(transportChecksumValid(request.src, request.dst, 6, request.payload.bytes)).toBe(true)

    const response = readIpv4(encode(ether(ip({ kind: 'tcp', srcPort: 80, dstPort: 49152, flags: ['ack', 'psh'], payload: { kind: 'http', message: 'response', status: 200, contentBytes: 40 } }))).payload)
    const text = response.payload.text(20, response.payload.bytes.length - 20)
    expect(text.startsWith('HTTP/1.0 200 OK\r\n')).toBe(true)
    expect(text).toContain('Content-Length: 40\r\n\r\n')
    expect(text.split('\r\n\r\n')[1]).toHaveLength(40)
  })

  it('writes DHCP as BOOTP with the magic cookie and options', () => {
    const offer: DhcpMessage = {
      kind: 'dhcp',
      messageType: 'offer',
      transactionId: 0xdeadbeef,
      clientMac: PC1,
      clientIp: '0.0.0.0',
      yourIp: '192.168.1.100',
      serverIp: '192.168.1.1',
      relayIp: '0.0.0.0',
      broadcast: true,
      options: { subnetMask: '255.255.255.0', routers: ['192.168.1.1'], dnsServers: ['8.8.8.8', '1.1.1.1'], leaseSeconds: 86400, serverIdentifier: '192.168.1.1', hostName: 'pc1' },
    }
    const packet = readIpv4(encode(ether(ip({ kind: 'udp', srcPort: 67, dstPort: 68, payload: offer }, '192.168.1.1', '255.255.255.255'))).payload)
    const udp = packet.payload
    expect(transportChecksumValid(packet.src, packet.dst, 17, udp.bytes)).toBe(true)
    const bootp = udp.slice(8)
    expect(bootp.bytes.length).toBeGreaterThanOrEqual(300)
    expect([bootp.u8(0), bootp.u8(1), bootp.u8(2), bootp.u32(4), bootp.u16(10)]).toEqual([2, 1, 6, 0xdeadbeef, 0x8000])
    expect([bootp.ipv4(12), bootp.ipv4(16), bootp.ipv4(20), bootp.ipv4(24), bootp.mac(28)]).toEqual(['0.0.0.0', '192.168.1.100', '192.168.1.1', '0.0.0.0', PC1])
    expect(bootp.u32(236)).toBe(0x63825363)
    const options = readDhcpOptions(bootp)
    expect([...(options.get(53) ?? [])]).toEqual([2])
    expect([...(options.get(1) ?? [])]).toEqual([255, 255, 255, 0])
    expect([...(options.get(6) ?? [])]).toEqual([8, 8, 8, 8, 1, 1, 1, 1])
    expect(new ByteReader(options.get(51) ?? new Uint8Array()).u32(0)).toBe(86400)
    expect(new TextDecoder().decode(options.get(12))).toBe('pc1')
  })

  it('writes DNS queries and answers with name compression', () => {
    const answer: DnsMessage = {
      kind: 'dns',
      id: 0xabcd,
      response: true,
      recursionDesired: true,
      recursionAvailable: true,
      authoritative: false,
      responseCode: 'noError',
      questions: [{ name: 'google.com', type: 'A' }],
      answers: [{ name: 'google.com', type: 'A', ttlSeconds: 300, address: '142.250.1.1' }],
    }
    const packet = readIpv4(encode(ether(ip({ kind: 'udp', srcPort: 53, dstPort: 50000, payload: answer }))).payload)
    expect(transportChecksumValid(packet.src, packet.dst, 17, packet.payload.bytes)).toBe(true)
    const dns = packet.payload.slice(8)
    expect([dns.u16(0), dns.u16(2), dns.u16(4), dns.u16(6)]).toEqual([0xabcd, 0x8180, 1, 1])
    const question = readDnsName(dns, 12)
    expect(question.name).toBe('google.com')
    expect([dns.u16(question.next), dns.u16(question.next + 2)]).toEqual([1, 1])
    const answerAt = question.next + 4
    expect(dns.u16(answerAt)).toBe(0xc00c)
    expect(readDnsName(dns, answerAt).name).toBe('google.com')
    expect([dns.u16(answerAt + 2), dns.u32(answerAt + 6), dns.u16(answerAt + 10), dns.ipv4(answerAt + 12)]).toEqual([1, 300, 4, '142.250.1.1'])
  })

  it('sets the NXDOMAIN response code', () => {
    const nx: DnsMessage = { kind: 'dns', id: 1, response: true, recursionDesired: true, recursionAvailable: true, authoritative: false, responseCode: 'nameError', questions: [{ name: 'nope.example', type: 'A' }], answers: [] }
    const dns = readIpv4(encode(ether(ip({ kind: 'udp', srcPort: 53, dstPort: 50000, payload: nx }))).payload).payload.slice(8)
    expect(dns.u16(2) & 0x000f).toBe(3)
  })
})
