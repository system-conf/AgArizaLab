import type { FailureReason, ResolveResult } from '../domain'
import { DnsNames } from '../net/DnsNames'

/** What asking one configured DNS server gave. */
export type DnsServerAnswer =
  | { kind: 'found'; ip: string }
  /** The server answered: no such name (NXDOMAIN). */
  | { kind: 'notFound' }
  /** No answer at all (no route, no upstream): the query times out. */
  | { kind: 'unreachable' }
  /** The address answers ping but runs no DNS service. */
  | { kind: 'notDns' }
  /** The sender's own address is unusable, so no server can be asked at all. */
  | { kind: 'addressProblem'; reason: Extract<FailureReason, 'ipConflict' | 'invalidHostAddress'> }

/** The client side of name resolution (PLAN §4.3), used by the DnsResolver. */
export class DnsQuery {
  /** Asks the servers in order; the first one that answers decides. */
  static run(servers: readonly string[], ask: (server: string) => DnsServerAnswer): ResolveResult {
    const usable = servers.filter((server) => server.trim() !== '')
    if (usable.length === 0) return { ok: false, reason: 'dnsNotSet' }

    let sawNonDns = false
    let lastServer: string | undefined
    for (const server of usable) {
      lastServer = server
      const answer = ask(server)
      switch (answer.kind) {
        case 'found':
          return { ok: true, ip: answer.ip, dnsServer: server }
        case 'notFound':
          return { ok: false, reason: 'nameNotFound', dnsServer: server }
        case 'addressProblem':
          return { ok: false, reason: answer.reason, dnsServer: server }
        case 'notDns':
          sawNonDns = true
          break
        case 'unreachable':
          break
      }
    }
    return { ok: false, reason: sawNonDns ? 'dnsNoAnswer' : 'dnsUnreachable', dnsServer: lastServer }
  }

  /** Names are case-insensitive and may end with the root dot. */
  static normalize(name: string): string {
    return DnsNames.normalize(name)
  }
}
