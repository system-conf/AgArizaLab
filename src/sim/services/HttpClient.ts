import { Ipv4 } from '../../net/Ipv4'
import {
  type DeviceContext,
  type HttpClientSession,
  type HttpResult,
  type IcmpErrorReport,
  type ServiceSession,
  type SimHttpGetRequest,
  type SimReason,
  SIM_PORTS,
  SIM_TIMING,
  type TcpSegment,
  type TransportDelivery,
} from '../contract'
import { ServiceNotes } from './ServiceNotes'
import { ServiceRuntimes } from './ServiceRuntimes'
import { ServiceSender } from './ServiceSender'
import { ServiceWire } from './ServiceWire'

/**
 * Minimal HTTP/1.0 browser (docs/SIMULATION.md §7.3): SYN → SYN-ACK → ACK + GET → response (the server
 * closes with FIN) → ACK + FIN. RST = connection refused; ICMP errors end the attempt; 5000 ms timeout.
 */
export class HttpClient {
  static listens(ctx: DeviceContext, port: number): boolean {
    return ServiceRuntimes.sessions(ctx).some((session) => session.kind === 'httpClient' && session.srcPort === port)
  }

  static get(ctx: DeviceContext, requestId: string, request: SimHttpGetRequest): void {
    if (!Ipv4.isValid(request.serverIp)) {
      ctx.openEvent({ flowId: requestId, protocol: 'http' }).conclude('dropped', 7, 'invalidConfig')
      return HttpClient.report(ctx, requestId, { ok: false, reason: 'invalidConfig' })
    }
    const isn = ServiceRuntimes.randomId(ctx, 32)
    const session: HttpClientSession = {
      kind: 'httpClient',
      requestId,
      serverIp: request.serverIp,
      host: request.host,
      path: request.path,
      srcPort: ServiceRuntimes.allocatePort(ctx),
      state: 'synSent',
      seq: isn,
    }
    ServiceRuntimes.addSession(ctx, session)
    const syn = ServiceWire.tcp(session.srcPort, SIM_PORTS.http, ['syn'], isn, null)
    const sent = ServiceSender.send(ctx, {
      ids: ctx.newPdu(requestId),
      dst: request.serverIp,
      payload: syn,
      notes: [ServiceNotes.message('tcpHandshake', { flags: ServiceWire.flagText(syn) })],
    })
    if (!sent.ok) return HttpClient.finish(ctx, session, { ok: false, reason: sent.reason })
    ctx.schedule(SIM_TIMING.httpTimeoutMs, { layer: 'services', kind: 'httpTimeout', requestId })
  }

  /** A segment for one of our connections (false = not ours). */
  static onSegment(ctx: DeviceContext, delivery: TransportDelivery, segment: TcpSegment): boolean {
    const session = HttpClient.sessionBy(ctx, (candidate) => candidate.srcPort === segment.dstPort && candidate.serverIp === delivery.packet.src)
    if (!session) return false
    const { event } = delivery
    const flags = new Set(segment.flags)
    if (flags.has('rst')) {
      ServiceNotes.add(event, 'in', 'tcpConnectionRefused', undefined, 4)
      event.conclude('delivered', 4)
      HttpClient.finish(ctx, session, { ok: false, reason: 'connectionRefused' })
      return true
    }
    const serverSeq = segment.seq ?? 0
    if (session.state === 'synSent' && flags.has('syn') && flags.has('ack') && segment.ack === ServiceWire.seqAdd(session.seq, 1)) {
      ServiceNotes.add(event, 'in', 'tcpHandshake', { flags: ServiceWire.flagText(segment) }, 4)
      event.conclude('replied', 7)
      const seq = ServiceWire.seqAdd(session.seq, 1)
      const ack = ServiceWire.seqAdd(serverSeq, 1)
      HttpClient.store(ctx, { ...session, state: 'requestSent', seq, ack })
      const request = { kind: 'http', message: 'request', method: 'GET', host: session.host, path: session.path } as const
      ServiceSender.send(ctx, {
        ids: ctx.newPdu(session.requestId),
        dst: session.serverIp,
        payload: ServiceWire.tcp(session.srcPort, SIM_PORTS.http, ['ack', 'psh'], seq, ack, request),
        causeEventId: event.id,
        notes: [ServiceNotes.message('httpRequest', { path: session.path, host: session.host })],
      })
      return true
    }
    const response = segment.payload
    if (session.state === 'requestSent' && response?.kind === 'http' && response.message === 'response') {
      ServiceNotes.add(event, 'in', 'httpResponse', { status: response.status })
      event.conclude('replied', 7)
      const seq = ServiceWire.seqAdd(session.seq, ServiceWire.httpRequestBytes(session.host, session.path))
      const ack = ServiceWire.seqAdd(serverSeq, response.contentBytes + (flags.has('fin') ? 1 : 0))
      ServiceSender.send(ctx, {
        ids: ctx.newPdu(session.requestId),
        dst: session.serverIp,
        payload: ServiceWire.tcp(session.srcPort, SIM_PORTS.http, ['ack', 'fin'], seq, ack),
        causeEventId: event.id,
        notes: [ServiceNotes.message('tcpClose')],
      })
      HttpClient.finish(ctx, session, { ok: true, status: response.status, contentBytes: response.contentBytes })
      return true
    }
    return false
  }

  /** ICMP error about our connection: the browser gives up (false = not ours). */
  static onIcmpError(ctx: DeviceContext, report: IcmpErrorReport, srcPort: number, dst: string): boolean {
    const session = HttpClient.sessionBy(ctx, (candidate) => candidate.srcPort === srcPort && candidate.serverIp === dst)
    if (!session) return false
    ServiceNotes.add(report.event, 'in', 'httpUnreachable', { ip: dst })
    let reason: SimReason = 'noRoute'
    if (report.local) reason = 'arpTimeout'
    else if (report.error.type === 'timeExceeded') reason = 'ttlExpired'
    else if (report.error.code === 'port') reason = 'connectionRefused'
    if (report.local) report.event.conclude('dropped', 7, 'arpTimeout')
    else report.event.conclude('delivered', 7)
    HttpClient.finish(ctx, session, { ok: false, reason })
    return true
  }

  static onTimeout(ctx: DeviceContext, requestId: string): void {
    const session = HttpClient.sessionBy(ctx, (candidate) => candidate.requestId === requestId)
    if (!session) return
    const event = ctx.openEvent({ flowId: requestId, protocol: 'http' })
    ServiceNotes.add(event, 'out', 'httpTimeout', { host: session.host, ms: SIM_TIMING.httpTimeoutMs })
    event.conclude('timedOut', 7, 'requestTimedOut')
    HttpClient.finish(ctx, session, { ok: false, reason: 'requestTimedOut' })
  }

  private static finish(ctx: DeviceContext, session: HttpClientSession, outcome: HttpResult['outcome']): void {
    HttpClient.store(ctx, null, session.requestId)
    HttpClient.report(ctx, session.requestId, outcome)
  }

  private static report(ctx: DeviceContext, requestId: string, outcome: HttpResult['outcome']): void {
    ctx.report(requestId, { kind: 'http', outcome }, true)
  }

  private static sessionBy(ctx: DeviceContext, matches: (session: HttpClientSession) => boolean): HttpClientSession | undefined {
    return ServiceRuntimes.sessions(ctx).find((session): session is HttpClientSession => session.kind === 'httpClient' && matches(session))
  }

  private static store(ctx: DeviceContext, session: HttpClientSession | null, requestId = session?.requestId): void {
    const matches = (candidate: ServiceSession) => candidate.kind === 'httpClient' && candidate.requestId === requestId
    ServiceRuntimes.replaceSession(ctx, matches, session)
  }
}
