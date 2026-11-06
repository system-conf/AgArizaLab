import {
  type DhcpMessage,
  type DnsAnswer,
  type DnsMessage,
  type DnsResponseCode,
  type HttpMessage,
  type TcpFlag,
  type TcpSegment,
  type UdpDatagram,
  type UdpPayload,
  UNSPECIFIED_IP,
} from '../contract'

/** DHCP fields a message sets; the rest default to "not set" (0.0.0.0, no relay, no options). */
export type DhcpDraft = Pick<DhcpMessage, 'messageType' | 'transactionId' | 'clientMac'> & Partial<Omit<DhcpMessage, 'kind'>>

const TCP_FLAG_ORDER: readonly TcpFlag[] = ['syn', 'ack', 'fin', 'rst', 'psh']

/** Builders of the UDP / TCP payloads the services layer sends (plain PDU objects). */
export class ServiceWire {
  static udp(srcPort: number, dstPort: number, payload: UdpPayload): UdpDatagram {
    return { kind: 'udp', srcPort, dstPort, payload }
  }

  static dhcp(draft: DhcpDraft): DhcpMessage {
    return {
      kind: 'dhcp',
      clientIp: UNSPECIFIED_IP,
      yourIp: UNSPECIFIED_IP,
      serverIp: UNSPECIFIED_IP,
      relayIp: UNSPECIFIED_IP,
      broadcast: true,
      options: {},
      ...draft,
    }
  }

  static dnsQuery(id: number, name: string): DnsMessage {
    return {
      kind: 'dns',
      id,
      response: false,
      recursionDesired: true,
      recursionAvailable: false,
      authoritative: false,
      responseCode: 'noError',
      questions: [{ name, type: 'A' }],
      answers: [],
    }
  }

  /** An answer to `query`: one A record, or the response code alone (NXDOMAIN). */
  static dnsResponse(query: DnsMessage, answer: DnsAnswer | null, authoritative: boolean, responseCode: DnsResponseCode = 'noError'): DnsMessage {
    return {
      ...query,
      response: true,
      recursionAvailable: true,
      authoritative,
      responseCode: answer === null && responseCode === 'noError' ? 'nameError' : responseCode,
      answers: answer === null ? [] : [answer],
    }
  }

  /** A TCP segment; flags are put in the canonical order (syn, ack, fin, rst, psh). */
  static tcp(srcPort: number, dstPort: number, flags: readonly TcpFlag[], seq: number, ack: number | null, payload: HttpMessage | null = null): TcpSegment {
    return {
      kind: 'tcp',
      srcPort,
      dstPort,
      flags: TCP_FLAG_ORDER.filter((flag) => flags.includes(flag)),
      seq,
      ...(ack === null ? {} : { ack }),
      payload,
    }
  }

  /** Bytes of an HTTP/1.0 GET request line + Host header (for sequence numbers). */
  static httpRequestBytes(host: string, path: string): number {
    return `GET ${path} HTTP/1.0\r\nHost: ${host}\r\n\r\n`.length
  }

  /** TCP flags as printed in notes ('SYN, ACK'). */
  static flagText(segment: TcpSegment): string {
    return segment.flags.map((flag) => flag.toUpperCase()).join(', ')
  }

  /** 32-bit sequence arithmetic. */
  static seqAdd(seq: number, bytes: number): number {
    return (seq + bytes) % 2 ** 32
  }
}
