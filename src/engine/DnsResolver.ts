import type { FailureReason, ResolveResult } from '../domain/EngineContract'
import type { NetworkState } from '../domain/NetworkTypes'
import { DeviceLookup } from './DeviceLookup'
import { internetHosts } from './internetHosts'
import { Ipv4 } from './Ipv4'
import type { ReachabilityChecker } from './ReachabilityChecker'

/** The sender's own address is unusable, so no server can be asked at all. */
type AddressProblem = Extract<FailureReason, 'ipConflict' | 'invalidHostAddress'>

/** Result of asking one configured DNS server. */
type ServerAnswer = 'answers' | 'unreachable' | 'notDns' | AddressProblem

/** A ping / tracert target: an IPv4 address as typed, or a name resolved to one. */
export type ResolvedTarget = { ok: true; ip: string; name: string | null } | { ok: false }

/** Name resolution through the device's DNS servers (PLAN §4.3). */
export class DnsResolver {
  private readonly reachability: ReachabilityChecker

  constructor(reachability: ReachabilityChecker) {
    this.reachability = reachability
  }

  resolve(state: NetworkState, fromDeviceId: string, name: string): ResolveResult {
    const device = DeviceLookup.require(state, fromDeviceId)
    const servers = device.host?.dns.filter((server) => server.trim() !== '') ?? []
    if (servers.length === 0) return { ok: false, reason: 'dnsNotSet' }

    let sawNonDns = false
    let lastServer: string | undefined
    for (const server of servers) {
      lastServer = server
      const answer = this.askServer(state, fromDeviceId, server)
      if (answer === 'ipConflict' || answer === 'invalidHostAddress') return { ok: false, reason: answer, dnsServer: server }
      if (answer === 'notDns') sawNonDns = true
      if (answer !== 'answers') continue

      const ip = internetHosts.names[this.normalize(name)]
      if (ip === undefined) return { ok: false, reason: 'nameNotFound', dnsServer: server }
      return { ok: true, ip, dnsServer: server }
    }
    return { ok: false, reason: sawNonDns ? 'dnsNoAnswer' : 'dnsUnreachable', dnsServer: lastServer }
  }

  /** An address is used as is; anything else is looked up as a name (`name` is then set). */
  resolveTarget(state: NetworkState, fromDeviceId: string, target: string): ResolvedTarget {
    if (Ipv4.isValid(target)) return { ok: true, ip: target, name: null }
    const resolved = this.resolve(state, fromDeviceId, target)
    return resolved.ok ? { ok: true, ip: resolved.ip, name: target } : { ok: false }
  }

  private askServer(state: NetworkState, fromDeviceId: string, server: string): ServerAnswer {
    if (!Ipv4.isValid(server)) return 'unreachable'
    const reach = this.reachability.reach(state, fromDeviceId, server)
    if (!reach.ok) return reach.reason === 'ipConflict' || reach.reason === 'invalidHostAddress' ? reach.reason : 'unreachable'

    if (internetHosts.publicDnsServers.includes(server)) return 'answers'
    const owner = DeviceLookup.answeringDevice(state, reach.path, server)
    if (owner?.kind === 'router' && owner.dnsForwarding === true) {
      // A forwarder needs the internet to answer; without WAN the query times out.
      return owner.wanUp === true ? 'answers' : 'unreachable'
    }
    // A local device that answers ping but runs no DNS; public non-resolvers simply time out.
    return owner ? 'notDns' : 'unreachable'
  }

  private normalize(name: string): string {
    return name.trim().toLowerCase().replace(/\.$/, '')
  }
}
