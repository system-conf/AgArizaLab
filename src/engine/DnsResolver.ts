import type { Device, NetworkState, ResolveResult } from '../domain'
import { type DnsServerAnswer, DnsQuery } from './DnsQuery'
import { internetHosts } from './internetHosts'
import { Ipv4 } from './Ipv4'
import { ProbeReports, type ResolvedTarget } from './ProbeReports'
import { DeviceAddresses } from './DeviceAddresses'
import type { ReachabilityChecker } from './ReachabilityChecker'
import { Topology } from './Topology'

/** A forwarder chain longer than this is treated as a loop (the query times out). */
const MAX_FORWARDING_DEPTH = 4

/**
 * Name resolution on a v2 state (MODEL_V2 §4, §13): the host asks its DNS servers in order; a public
 * resolver answers from the internet's names; a device running the DNS service answers from its
 * records, else asks its forwarders in order (reachability from that device).
 */
export class DnsResolver {
  private readonly reachability: ReachabilityChecker

  constructor(reachability: ReachabilityChecker) {
    this.reachability = reachability
  }

  resolve(state: NetworkState, fromDeviceId: string, name: string): ResolveResult {
    const device = Topology.of(state).require(fromDeviceId)
    return DnsQuery.run(device.host?.dnsServers ?? [], (server) => this.ask(state, fromDeviceId, server, name, 0))
  }

  /** An address is used as is; anything else is looked up as a name (`name` is then set). */
  resolveTarget(state: NetworkState, fromDeviceId: string, target: string): ResolvedTarget {
    return ProbeReports.target(target, (name) => this.resolve(state, fromDeviceId, name))
  }

  private ask(state: NetworkState, fromDeviceId: string, server: string, name: string, depth: number): DnsServerAnswer {
    if (!Ipv4.isValid(server)) return { kind: 'unreachable' }
    const reach = this.reachability.reach(state, fromDeviceId, server)
    if (!reach.ok) {
      return reach.reason === 'ipConflict' || reach.reason === 'invalidHostAddress'
        ? { kind: 'addressProblem', reason: reach.reason }
        : { kind: 'unreachable' }
    }
    if (internetHosts.publicDnsServers.includes(server)) return this.internetLookup(name)
    const owner = DeviceAddresses.answeringDevice(state, reach.path, server)
    if (owner?.services?.dns?.enabled === true) return this.serverLookup(state, owner, name, depth)
    // A local device that answers ping but runs no DNS; public non-resolvers simply time out.
    return owner ? { kind: 'notDns' } : { kind: 'unreachable' }
  }

  /** Own records first, then the forwarders in order; no working forwarder → the query times out. */
  private serverLookup(state: NetworkState, server: Device, name: string, depth: number): DnsServerAnswer {
    const wanted = DnsQuery.normalize(name)
    const record = server.services?.dns?.records.find((candidate) => DnsQuery.normalize(candidate.name) === wanted)
    if (record) return { kind: 'found', ip: record.address }
    const forwarders = server.services?.dns?.forwarders ?? []
    if (forwarders.length === 0) return { kind: 'notFound' }
    if (depth >= MAX_FORWARDING_DEPTH) return { kind: 'unreachable' }
    for (const forwarder of forwarders) {
      const answer = this.ask(state, server.id, forwarder, name, depth + 1)
      if (answer.kind === 'found' || answer.kind === 'notFound') return answer
    }
    return { kind: 'unreachable' }
  }

  private internetLookup(name: string): DnsServerAnswer {
    const ip = internetHosts.names[DnsQuery.normalize(name)]
    return ip === undefined ? { kind: 'notFound' } : { kind: 'found', ip }
  }
}
