// Application payloads on the wire: DHCP over BOOTP (RFC 2131 / 2132), DNS (RFC 1035) and HTTP text.
import type { DhcpMessage, DhcpMessageType, DnsMessage, DnsResponseCode, HttpMessage } from '../contract/Pdu'
import { PduLayers } from '../contract/PduLayers'
import { ByteWriter } from './ByteWriter'

const DHCP_MESSAGE_TYPES: Readonly<Record<DhcpMessageType, number>> = {
  discover: 1,
  offer: 2,
  request: 3,
  decline: 4,
  ack: 5,
  nak: 6,
  release: 7,
  inform: 8,
}

const DNS_RESPONSE_CODES: Readonly<Record<DnsResponseCode, number>> = {
  noError: 0,
  formatError: 1,
  serverFailure: 2,
  nameError: 3,
  refused: 5,
}

const HTTP_REASONS: Readonly<Record<number, string>> = {
  200: 'OK',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  403: 'Forbidden',
  404: 'Not Found',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
}

/** BOOTP messages are at least 300 bytes (RFC 1542); short ones are padded after the end option. */
const BOOTP_MIN_BYTES = 300
const DHCP_MAGIC_COOKIE = [99, 130, 83, 99]
/** Bodies are capped so an IPv4 packet never exceeds its 16-bit total length. */
const MAX_HTTP_BODY = 60_000
const HTML_OPEN = '<html><body>'
const HTML_CLOSE = '</body></html>'

export class ApplicationEncoder {
  static dhcp(message: DhcpMessage): Uint8Array {
    const out = new ByteWriter()
      .u8(PduLayers.dhcpOp(message.messageType))
      .u8(1) // htype: Ethernet
      .u8(6) // hlen
      .u8(0) // hops
      .u32(message.transactionId >>> 0)
      .u16(0) // secs
      .u16(message.broadcast ? 0x8000 : 0)
      .ipv4(message.clientIp)
      .ipv4(message.yourIp)
      .ipv4(message.serverIp)
      .ipv4(message.relayIp)
      .mac(message.clientMac)
      .zeros(10) // rest of chaddr
      .zeros(64) // sname
      .zeros(128) // file
      .raw(DHCP_MAGIC_COOKIE)
    ApplicationEncoder.dhcpOptions(out, message)
    if (out.length < BOOTP_MIN_BYTES) out.zeros(BOOTP_MIN_BYTES - out.length)
    return out.toBytes()
  }

  private static dhcpOptions(out: ByteWriter, message: DhcpMessage): void {
    const { options } = message
    out.u8(53).u8(1).u8(DHCP_MESSAGE_TYPES[message.messageType])
    if (options.serverIdentifier !== undefined) out.u8(54).u8(4).ipv4(options.serverIdentifier)
    if (options.requestedIp !== undefined) out.u8(50).u8(4).ipv4(options.requestedIp)
    if (options.leaseSeconds !== undefined) out.u8(51).u8(4).u32(options.leaseSeconds >>> 0)
    if (options.subnetMask !== undefined) out.u8(1).u8(4).ipv4(options.subnetMask)
    ApplicationEncoder.addressList(out, 3, options.routers)
    ApplicationEncoder.addressList(out, 6, options.dnsServers)
    ApplicationEncoder.textOption(out, 12, options.hostName)
    ApplicationEncoder.textOption(out, 56, options.message)
    out.u8(255)
  }

  private static addressList(out: ByteWriter, code: number, addresses: readonly string[] | undefined): void {
    // An option carries at most 255 bytes: 63 addresses.
    const list = (addresses ?? []).slice(0, 63)
    if (list.length === 0) return
    out.u8(code).u8(list.length * 4)
    for (const address of list) out.ipv4(address)
  }

  private static textOption(out: ByteWriter, code: number, value: string | undefined): void {
    if (value === undefined || value === '') return
    const bytes = new ByteWriter().text(value).toBytes().slice(0, 255)
    out.u8(code).u8(bytes.length).raw(bytes)
  }

  static dns(message: DnsMessage): Uint8Array {
    const flags =
      (message.response ? 0x8000 : 0) |
      (message.authoritative ? 0x0400 : 0) |
      (message.recursionDesired ? 0x0100 : 0) |
      (message.recursionAvailable ? 0x0080 : 0) |
      DNS_RESPONSE_CODES[message.responseCode]
    const out = new ByteWriter()
      .u16(message.id)
      .u16(flags)
      .u16(message.questions.length)
      .u16(message.answers.length)
      .u16(0) // authority
      .u16(0) // additional
    for (const question of message.questions) {
      ApplicationEncoder.dnsName(out, question.name)
      out.u16(1).u16(1) // type A, class IN
    }
    const firstQuestion = message.questions[0]?.name
    for (const answer of message.answers) {
      // Name compression: a pointer to the first question's name (offset 12) when it is the same name.
      if (firstQuestion !== undefined && ApplicationEncoder.sameName(answer.name, firstQuestion)) out.u16(0xc00c)
      else ApplicationEncoder.dnsName(out, answer.name)
      out.u16(1).u16(1).u32(answer.ttlSeconds >>> 0).u16(4).ipv4(answer.address)
    }
    return out.toBytes()
  }

  private static sameName(a: string, b: string): boolean {
    return ApplicationEncoder.labels(a).join('.').toLowerCase() === ApplicationEncoder.labels(b).join('.').toLowerCase()
  }

  private static labels(name: string): string[] {
    return name.split('.').filter((label) => label !== '')
  }

  private static dnsName(out: ByteWriter, name: string): void {
    for (const label of ApplicationEncoder.labels(name)) {
      const bytes = new ByteWriter().text(label).toBytes().slice(0, 63)
      out.u8(bytes.length).raw(bytes)
    }
    out.u8(0)
  }

  static http(message: HttpMessage): Uint8Array {
    if (message.message === 'request') {
      return new ByteWriter().text(`GET ${message.path} HTTP/1.0\r\nHost: ${message.host}\r\n\r\n`).toBytes()
    }
    const reason = HTTP_REASONS[message.status] ?? ''
    const length = Math.max(0, Math.min(message.contentBytes, MAX_HTTP_BODY))
    const head = `HTTP/1.0 ${message.status} ${reason}\r\nContent-Type: text/html\r\nContent-Length: ${length}\r\n\r\n`
    return new ByteWriter().text(head).text(ApplicationEncoder.body(length)).toBytes()
  }

  /** A deterministic HTML body of exactly `length` bytes. */
  private static body(length: number): string {
    const frame = HTML_OPEN.length + HTML_CLOSE.length
    if (length < frame) return '.'.repeat(length)
    return `${HTML_OPEN}${'.'.repeat(length - frame)}${HTML_CLOSE}`
  }
}
