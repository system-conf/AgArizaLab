import { DnsQuery } from '../../engine/DnsQuery'
import { internetHosts } from '../../engine/internetHosts'
import { Ipv4 } from '../../engine/Ipv4'
import {
  type DeviceContext,
  type DnsForwardSession,
  type DnsMessage,
  DeviceProfiles,
  type IcmpErrorReport,
  type ServiceSession,
  SIM_PORTS,
  SIM_TIMING,
  type TransportDelivery,
  type UdpDatagram,
} from '../contract'
import { ServiceNotes } from './ServiceNotes'
import { ServiceRuntimes } from './ServiceRuntimes'
import { ServiceSender } from './ServiceSender'
import { ServiceWire } from './ServiceWire'

/**
 * DNS servers (docs/SIMULATION.md §7.3). A device with `services.dns.enabled` answers from its records
 * (names via DnsQuery.normalize), else asks its forwarders in order (500 ms each) as a client and passes
 * the answer back; no forwarders → NXDOMAIN; all forwarders silent → no answer (the client times out);
 * a query for a name it is already forwarding is a loop → dropped. The internet cloud runs the public
 * resolvers (internetHosts.publicDnsServers) that answer from internetHosts.names (TTL 300 s) or NXDOMAIN.
 */
export class DnsServer {
  /** UDP 53 on this address: the cloud on every public address (non-resolvers drop), a DNS device when enabled. */
  static listensOn(ctx: DeviceContext, dstIp: string): boolean {
    if (DeviceProfiles.of(ctx.device).isp) return Ipv4.isPublic(dstIp)
    return DeviceProfiles.of(ctx.device).dnsServer
  }

  /** Port of an upstream query in flight. */
  static forwardListens(ctx: DeviceContext, port: number): boolean {
    return ServiceRuntimes.sessions(ctx).some((session) => session.kind === 'dnsForward' && session.srcPort === port)
  }

  static onQuery(ctx: DeviceContext, delivery: TransportDelivery, udp: UdpDatagram, query: DnsMessage): void {
    const { event } = delivery
    const question = query.questions[0]
    if (!question) return event.conclude('dropped', 7, 'unsupported')
    const name = DnsQuery.normalize(question.name)
    if (DeviceProfiles.of(ctx.device).isp) return DnsServer.publicResolver(ctx, delivery, query, name)
    const dns = ctx.device.services?.dns
    if (dns?.enabled !== true) return event.conclude('dropped', 7, 'dnsServiceDisabled')
    const record = dns.records.find((candidate) => DnsQuery.normalize(candidate.name) === name)
    if (record) {
      ServiceNotes.add(event, 'in', 'dnsRecordFound', { name, ip: record.address })
      return DnsServer.answer(ctx, delivery, query, record.address, true)
    }
    if (dns.forwarders.length === 0) {
      ServiceNotes.add(event, 'in', 'dnsNoForwarders', { name })
      return DnsServer.answer(ctx, delivery, query, null, true)
    }
    if (ServiceRuntimes.sessions(ctx).some((session) => session.kind === 'dnsForward' && session.name === name)) {
      ServiceNotes.add(event, 'in', 'dnsLoop', { name })
      return event.conclude('dropped', 7, 'dnsLoop')
    }
    const session: DnsForwardSession = {
      kind: 'dnsForward',
      name,
      forwarderIndex: 0,
      upstreamQueryId: 0,
      srcPort: ServiceRuntimes.allocatePort(ctx),
      client: { ip: delivery.packet.src, port: udp.srcPort, queryId: query.id },
      serverIp: delivery.packet.dst,
      flowId: delivery.ids.flowId,
    }
    ServiceRuntimes.addSession(ctx, session)
    ServiceNotes.add(event, 'in', 'dnsForwarded', { name, server: dns.forwarders[0] ?? '' })
    event.conclude('delivered', 7)
    DnsServer.forward(ctx, session, 0, event.id)
  }

  /** A forwarder's answer (false = not for a forward session). */
  static onForwardResponse(ctx: DeviceContext, delivery: TransportDelivery, dstPort: number, dns: DnsMessage): boolean {
    const session = DnsServer.sessionBy(ctx, (candidate) => candidate.srcPort === dstPort && candidate.upstreamQueryId === dns.id)
    if (!session) return false
    const { event } = delivery
    const answer = dns.answers[0]
    if ((dns.responseCode === 'noError' && answer) || dns.responseCode === 'nameError') {
      if (answer) ServiceNotes.add(event, 'in', 'dnsAnswer', { name: session.name, ip: answer.address })
      else ServiceNotes.add(event, 'in', 'dnsNameError', { name: session.name })
      event.conclude('delivered', 7)
      DnsServer.store(ctx, session.srcPort, null)
      const query = ServiceWire.dnsQuery(session.client.queryId, session.name)
      ServiceSender.send(ctx, {
        ids: ctx.newPdu(session.flowId ?? delivery.ids.flowId),
        dst: session.client.ip,
        ...(session.serverIp === undefined ? {} : { src: session.serverIp }),
        payload: ServiceWire.udp(SIM_PORTS.dns, session.client.port, ServiceWire.dnsResponse(query, answer ?? null, false)),
        causeEventId: event.id,
        notes: [ServiceNotes.message('dnsForwardAnswer', { client: session.client.ip })],
      })
      return true
    }
    ServiceNotes.add(event, 'in', 'dnsServerUnreachable', { server: delivery.packet.src })
    event.conclude('delivered', 7)
    DnsServer.forward(ctx, session, session.forwarderIndex + 1, event.id)
    return true
  }

  /** ICMP error about an upstream query: the next forwarder is asked (false = not ours). */
  static onIcmpError(ctx: DeviceContext, report: IcmpErrorReport, srcPort: number, dst: string): boolean {
    const forwarders = ctx.device.services?.dns?.forwarders ?? []
    const session = DnsServer.sessionBy(ctx, (candidate) => candidate.srcPort === srcPort && forwarders[candidate.forwarderIndex] === dst)
    if (!session) return false
    ServiceNotes.add(report.event, 'in', 'dnsServerUnreachable', { server: dst })
    if (report.local) report.event.conclude('dropped', 7, 'arpTimeout')
    else report.event.conclude('delivered', 7)
    DnsServer.forward(ctx, session, session.forwarderIndex + 1, report.event.id)
    return true
  }

  static onTimeout(ctx: DeviceContext, upstreamQueryId: number): void {
    const session = DnsServer.sessionBy(ctx, (candidate) => candidate.upstreamQueryId === upstreamQueryId)
    if (!session) return
    const forwarder = ctx.device.services?.dns?.forwarders[session.forwarderIndex] ?? ''
    const event = ctx.openEvent({ flowId: session.flowId ?? `bg:${ctx.device.id}`, protocol: 'dns' })
    ServiceNotes.add(event, 'out', 'dnsForwardTimeout', { server: forwarder })
    event.conclude('timedOut', 7, 'requestTimedOut')
    DnsServer.forward(ctx, session, session.forwarderIndex + 1, event.id)
  }

  /** Asks forwarder `index` (or the next usable one); gives up silently when none is left. */
  private static forward(ctx: DeviceContext, session: DnsForwardSession, index: number, causeEventId: number): void {
    const forwarders = ctx.device.services?.dns?.forwarders ?? []
    const flowId = session.flowId ?? `bg:${ctx.device.id}`
    for (let current = index; current < forwarders.length; current += 1) {
      const forwarder = (forwarders[current] ?? '').trim()
      if (!Ipv4.isValid(forwarder)) continue
      const asking: DnsForwardSession = { ...session, forwarderIndex: current, upstreamQueryId: ServiceRuntimes.randomId(ctx, 16) }
      DnsServer.store(ctx, session.srcPort, asking)
      const sent = ServiceSender.send(ctx, {
        ids: ctx.newPdu(flowId),
        dst: forwarder,
        payload: ServiceWire.udp(session.srcPort, SIM_PORTS.dns, ServiceWire.dnsQuery(asking.upstreamQueryId, session.name)),
        causeEventId,
        notes: [ServiceNotes.message('dnsForwarded', { name: session.name, server: forwarder })],
      })
      if (sent.ok) {
        ctx.schedule(SIM_TIMING.dnsForwardTimeoutMs, { layer: 'services', kind: 'dnsForwardTimeout', upstreamQueryId: asking.upstreamQueryId })
        return
      }
    }
    DnsServer.store(ctx, session.srcPort, null)
    const event = ctx.openEvent({ flowId, protocol: 'dns', causeEventId })
    ServiceNotes.add(event, 'out', 'dnsForwardFailed', { name: session.name })
    event.conclude('timedOut', 7, 'requestTimedOut')
  }

  private static publicResolver(ctx: DeviceContext, delivery: TransportDelivery, query: DnsMessage, name: string): void {
    const { event, packet } = delivery
    if (!internetHosts.publicDnsServers.includes(packet.dst)) {
      ServiceNotes.add(event, 'in', 'dnsNotAResolver', { ip: packet.dst })
      return event.conclude('dropped', 7, 'dnsNotAResolver')
    }
    ServiceNotes.add(event, 'in', 'dnsPublicResolver', { server: packet.dst })
    DnsServer.answer(ctx, delivery, query, internetHosts.names[name] ?? null, false)
  }

  /** Answers the query: one A record (TTL 300 s), or NXDOMAIN when `address` is null. */
  private static answer(ctx: DeviceContext, delivery: TransportDelivery, query: DnsMessage, address: string | null, authoritative: boolean): void {
    const question = query.questions[0]
    const name = question ? DnsQuery.normalize(question.name) : ''
    const record = address === null ? null : { name, type: 'A' as const, ttlSeconds: SIM_TIMING.dnsAnswerTtlSeconds, address }
    delivery.event.conclude('replied', 7)
    const udp = delivery.packet.payload
    const clientPort = udp.kind === 'udp' ? udp.srcPort : SIM_PORTS.dns
    const note = address === null ? ServiceNotes.message('dnsNameError', { name }) : ServiceNotes.message('dnsAnswer', { name, ip: address })
    ServiceSender.reply(ctx, delivery, ServiceWire.udp(SIM_PORTS.dns, clientPort, ServiceWire.dnsResponse(query, record, authoritative)), [note])
  }

  private static sessionBy(ctx: DeviceContext, matches: (session: DnsForwardSession) => boolean): DnsForwardSession | undefined {
    return ServiceRuntimes.sessions(ctx).find((session): session is DnsForwardSession => session.kind === 'dnsForward' && matches(session))
  }

  private static store(ctx: DeviceContext, srcPort: number, session: DnsForwardSession | null): void {
    const matches = (candidate: ServiceSession) => candidate.kind === 'dnsForward' && candidate.srcPort === srcPort
    ServiceRuntimes.replaceSession(ctx, matches, session)
  }
}
