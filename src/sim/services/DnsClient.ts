import type { ResolveResult } from '../../domain'
import { DnsNames } from '../../net/DnsNames'
import { Ipv4 } from '../../net/Ipv4'
import { RuntimeTables } from '../core/RuntimeTables'
import {
  type DeviceContext,
  type DnsClientSession,
  type DnsMessage,
  type IcmpErrorReport,
  type ServiceSession,
  type SimDnsQueryRequest,
  SIM_PORTS,
  SIM_TIMING,
  type TransportDelivery,
} from '../contract'
import { ServiceNotes } from './ServiceNotes'
import { ServiceRuntimes } from './ServiceRuntimes'
import { ServiceSender } from './ServiceSender'
import { ServiceWire } from './ServiceWire'

/**
 * DNS client (nslookup / name lookup before ping; docs/SIMULATION.md §7.3) with the order and outcomes of
 * the engine's DnsQuery.run: servers in order, 2000 ms each; an answer or NXDOMAIN decides; ICMP port
 * unreachable (no DNS there) is remembered and the next server is asked; timeouts and local failures go
 * to the next server; ipConflict / invalidHostAddress stop at once; at the end dnsNoAnswer when a server
 * had no DNS, else dnsUnreachable.
 */
export class DnsClient {
  static listens(ctx: DeviceContext, port: number): boolean {
    return ServiceRuntimes.sessions(ctx).some((session) => session.kind === 'dnsClient' && session.srcPort === port)
  }

  static query(ctx: DeviceContext, requestId: string, request: SimDnsQueryRequest): void {
    const servers = (request.servers ?? ctx.device.host?.dnsServers ?? []).filter((server) => server.trim() !== '')
    if (servers.length === 0) {
      const event = ctx.openEvent({ flowId: requestId, protocol: 'dns' })
      ServiceNotes.add(event, 'out', 'dnsNotSet')
      event.conclude('dropped', 7, 'invalidConfig')
      return DnsClient.report(ctx, requestId, request.name, { ok: false, reason: 'dnsNotSet' })
    }
    if (request.useCache === true && DnsClient.fromCache(ctx, requestId, request.name, servers)) return
    const session: DnsClientSession = {
      kind: 'dnsClient',
      requestId,
      name: request.name,
      servers,
      serverIndex: 0,
      queryId: 0,
      srcPort: ServiceRuntimes.allocatePort(ctx),
      sawNoDns: false,
      useCache: request.useCache === true,
    }
    ServiceRuntimes.addSession(ctx, session)
    DnsClient.ask(ctx, session, 0)
  }

  /** A response for one of our queries (false = not ours). */
  static onResponse(ctx: DeviceContext, delivery: TransportDelivery, dstPort: number, dns: DnsMessage): boolean {
    const session = ServiceRuntimes.sessions(ctx).find(
      (candidate): candidate is DnsClientSession => candidate.kind === 'dnsClient' && candidate.srcPort === dstPort && candidate.queryId === dns.id,
    )
    if (!session) return false
    const { event } = delivery
    const server = session.servers[session.serverIndex] ?? delivery.packet.src
    const answer = dns.answers[0]
    if (dns.responseCode === 'noError' && answer) {
      ServiceNotes.add(event, 'in', 'dnsAnswer', { name: session.name, ip: answer.address })
      event.conclude('delivered', 7)
      DnsClient.finish(ctx, session, { ok: true, ip: answer.address, dnsServer: server }, answer.ttlSeconds)
    } else if (dns.responseCode === 'nameError') {
      ServiceNotes.add(event, 'in', 'dnsNameError', { name: session.name })
      event.conclude('delivered', 7)
      DnsClient.finish(ctx, session, { ok: false, reason: 'nameNotFound', dnsServer: server }, SIM_TIMING.dnsAnswerTtlSeconds)
    } else {
      ServiceNotes.add(event, 'in', 'dnsServerUnreachable', { server })
      event.conclude('delivered', 7)
      DnsClient.ask(ctx, session, session.serverIndex + 1)
    }
    return true
  }

  /** ICMP error about one of our queries (false = not ours). */
  static onIcmpError(ctx: DeviceContext, report: IcmpErrorReport, srcPort: number, dst: string): boolean {
    const session = ServiceRuntimes.sessions(ctx).find(
      (candidate): candidate is DnsClientSession =>
        candidate.kind === 'dnsClient' && candidate.srcPort === srcPort && candidate.servers[candidate.serverIndex] === dst,
    )
    if (!session) return false
    const noDns = !report.local && report.error.type === 'destinationUnreachable' && report.error.code === 'port'
    ServiceNotes.add(report.event, 'in', noDns ? 'dnsNoService' : 'dnsServerUnreachable', { server: dst })
    if (report.local) report.event.conclude('dropped', 7, 'arpTimeout')
    else report.event.conclude('delivered', 7)
    DnsClient.ask(ctx, { ...session, sawNoDns: session.sawNoDns || noDns }, session.serverIndex + 1)
    return true
  }

  static onTimeout(ctx: DeviceContext, queryId: number): void {
    const session = ServiceRuntimes.sessions(ctx).find(
      (candidate): candidate is DnsClientSession => candidate.kind === 'dnsClient' && candidate.queryId === queryId,
    )
    if (!session) return
    const event = ctx.openEvent({ flowId: session.requestId, protocol: 'dns' })
    ServiceNotes.add(event, 'out', 'dnsTimeout', { server: session.servers[session.serverIndex] ?? '' })
    event.conclude('timedOut', 7, 'requestTimedOut')
    DnsClient.ask(ctx, session, session.serverIndex + 1)
  }

  /** Asks server `index` (or the next usable one); reports the end result when none is left. */
  private static ask(ctx: DeviceContext, session: DnsClientSession, index: number): void {
    for (let current = index; current < session.servers.length; current += 1) {
      const server = (session.servers[current] ?? '').trim()
      if (!Ipv4.isValid(server)) continue
      const asking: DnsClientSession = { ...session, serverIndex: current, queryId: ServiceRuntimes.randomId(ctx, 16) }
      DnsClient.store(ctx, asking)
      const query = ServiceWire.dnsQuery(asking.queryId, DnsNames.normalize(session.name))
      const sent = ServiceSender.send(ctx, {
        ids: ctx.newPdu(session.requestId),
        dst: server,
        payload: ServiceWire.udp(session.srcPort, SIM_PORTS.dns, query),
        notes: [ServiceNotes.message('dnsQuery', { name: session.name, server })],
      })
      if (sent.ok) {
        ctx.schedule(SIM_TIMING.dnsTimeoutMs, { layer: 'services', kind: 'dnsTimeout', queryId: asking.queryId })
        return
      }
      if (sent.reason === 'ipConflict' || sent.reason === 'invalidHostAddress') {
        return DnsClient.finish(ctx, asking, { ok: false, reason: sent.reason, dnsServer: session.servers[current] ?? server }, 0)
      }
    }
    const last = session.servers[session.servers.length - 1]
    DnsClient.finish(ctx, session, { ok: false, reason: session.sawNoDns ? 'dnsNoAnswer' : 'dnsUnreachable', ...(last === undefined ? {} : { dnsServer: last }) }, 0)
  }

  /** Ends the query: the session goes, the cache learns the answer (name lookups only), the result is reported. */
  private static finish(ctx: DeviceContext, session: DnsClientSession, answer: ResolveResult, ttlSeconds: number): void {
    DnsClient.store(ctx, null, session.requestId)
    const cacheable = answer.ok || answer.reason === 'nameNotFound'
    if (session.useCache === true && cacheable && ttlSeconds > 0) {
      const name = DnsNames.normalize(session.name)
      const entry = { name, address: answer.ok ? answer.ip : null, expiresAt: ctx.now + ttlSeconds * 1000 }
      ServiceRuntimes.update(ctx, (services) => ({
        ...services,
        dnsCache: [...services.dnsCache.filter((cached) => cached.name !== name && RuntimeTables.isLive(cached, ctx.now)), entry],
      }))
    }
    DnsClient.report(ctx, session.requestId, session.name, answer)
  }

  /** Answers from the resolver cache; false when the name is not cached. */
  private static fromCache(ctx: DeviceContext, requestId: string, name: string, servers: readonly string[]): boolean {
    const wanted = DnsNames.normalize(name)
    const cached = RuntimeTables.dnsCache(ctx.runtime, ctx.now).find((entry) => entry.name === wanted)
    const server = servers[0]
    if (!cached || server === undefined) return false
    const event = ctx.openEvent({ flowId: requestId, protocol: 'dns' })
    if (cached.address === null) ServiceNotes.add(event, 'out', 'dnsCacheNegative', { name })
    else ServiceNotes.add(event, 'out', 'dnsCacheHit', { name, ip: cached.address })
    event.conclude('delivered', 7)
    DnsClient.report(ctx, requestId, name, cached.address === null ? { ok: false, reason: 'nameNotFound', dnsServer: server } : { ok: true, ip: cached.address, dnsServer: server })
    return true
  }

  private static report(ctx: DeviceContext, requestId: string, name: string, answer: ResolveResult): void {
    ctx.report(requestId, { kind: 'dns', name, answer }, true)
  }

  private static store(ctx: DeviceContext, session: DnsClientSession | null, requestId = session?.requestId): void {
    const matches = (candidate: ServiceSession) => candidate.kind === 'dnsClient' && candidate.requestId === requestId
    ServiceRuntimes.replaceSession(ctx, matches, session)
  }
}
