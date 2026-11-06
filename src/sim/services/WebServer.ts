import { internetHosts } from '../../engine/internetHosts'
import { type DeviceContext, SIM_PORTS, type TcpSegment, type TransportDelivery } from '../contract'
import { ServiceNotes } from './ServiceNotes'
import { ServiceRuntimes } from './ServiceRuntimes'
import { ServiceSender } from './ServiceSender'
import { ServiceWire } from './ServiceWire'

/** Pages every internet site serves (anything else is 404). */
const PAGES: readonly string[] = ['/', '/index.html']
/** Fixed content sizes (bytes) of a page and of the 404 page. */
export const WEB_PAGE_BYTES = 1256
export const NOT_FOUND_BYTES = 345

/**
 * The internet's web servers (docs/SIMULATION.md §7.3): the cloud answers HTTP on the addresses of
 * internetHosts.names (200 for '/' and '/index.html', 404 otherwise, closing after the response like
 * HTTP/1.0); every other public address refuses the connection with RST. Stateless: each segment is
 * answered from its own sequence numbers.
 */
export class WebServer {
  static onSegment(ctx: DeviceContext, delivery: TransportDelivery, segment: TcpSegment): void {
    const { event, packet } = delivery
    const flags = new Set(segment.flags)
    const seq = segment.seq ?? 0
    if (flags.has('rst')) return event.conclude('delivered', 4)
    const hosted = Object.values(internetHosts.names).includes(packet.dst)
    const request = segment.payload?.kind === 'http' && segment.payload.message === 'request' ? segment.payload : null
    if (!hosted && (flags.has('syn') || request)) {
      ServiceNotes.add(event, 'in', 'tcpRefused', { port: segment.dstPort }, 4)
      event.conclude('replied', 4)
      const rst = ServiceWire.tcp(segment.dstPort, segment.srcPort, ['ack', 'rst'], 0, ServiceWire.seqAdd(seq, 1))
      ServiceSender.reply(ctx, delivery, rst, [ServiceNotes.message('tcpRefused', { port: segment.dstPort })])
      return
    }
    if (flags.has('syn')) {
      ServiceNotes.add(event, 'in', 'tcpHandshake', { flags: ServiceWire.flagText(segment) }, 4)
      event.conclude('replied', 4)
      const synAck = ServiceWire.tcp(SIM_PORTS.http, segment.srcPort, ['syn', 'ack'], ServiceRuntimes.randomId(ctx, 32), ServiceWire.seqAdd(seq, 1))
      ServiceSender.reply(ctx, delivery, synAck, [ServiceNotes.message('tcpHandshake', { flags: ServiceWire.flagText(synAck) })])
      return
    }
    if (request) {
      const found = PAGES.includes(request.path)
      ServiceNotes.add(event, 'in', 'httpRequest', { path: request.path, host: request.host })
      if (!found) ServiceNotes.add(event, 'in', 'httpPageMissing', { path: request.path })
      event.conclude('replied', 7)
      const status = found ? 200 : 404
      const response = { kind: 'http', message: 'response', status, contentBytes: found ? WEB_PAGE_BYTES : NOT_FOUND_BYTES } as const
      const ack = ServiceWire.seqAdd(seq, ServiceWire.httpRequestBytes(request.host, request.path))
      const segmentOut = ServiceWire.tcp(SIM_PORTS.http, segment.srcPort, ['ack', 'fin', 'psh'], segment.ack ?? 0, ack, response)
      ServiceSender.reply(ctx, delivery, segmentOut, [ServiceNotes.message('httpResponse', { status })])
      return
    }
    if (flags.has('fin')) ServiceNotes.add(event, 'in', 'tcpClose', undefined, 4)
    event.conclude('delivered', 4)
  }
}
