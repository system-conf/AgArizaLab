import type { ResolveResult } from '../domain/EngineContract'
import type { NetworkState } from '../domain/NetworkTypes'
import { DeviceLookup } from './DeviceLookup'
import { type DnsServerAnswer, DnsQuery } from './DnsQuery'
import { internetHosts } from './internetHosts'
import { Ipv4 } from './Ipv4'
import { ProbeReports, type ResolvedTarget } from './ProbeReports'
import type { ReachabilityChecker } from './ReachabilityChecker'

export type { ResolvedTarget }

/** Name resolution through the device's DNS servers (PLAN §4.3). */
export class DnsResolver {
  private readonly reachability: ReachabilityChecker

  constructor(reachability: ReachabilityChecker) {
    this.reachability = reachability
  }

  resolve(state: NetworkState, fromDeviceId: string, name: string): ResolveResult {
    const device = DeviceLookup.require(state, fromDeviceId)
    return DnsQuery.run(device.host?.dns ?? [], (server) => this.askServer(state, fromDeviceId, server, name))
  }

  /** An address is used as is; anything else is looked up as a name (`name` is then set). */
  resolveTarget(state: NetworkState, fromDeviceId: string, target: string): ResolvedTarget {
    return ProbeReports.target(target, (name) => this.resolve(state, fromDeviceId, name))
  }

  private askServer(state: NetworkState, fromDeviceId: string, server: string, name: string): DnsServerAnswer {
    if (!Ipv4.isValid(server)) return { kind: 'unreachable' }
    const reach = this.reachability.reach(state, fromDeviceId, server)
    if (!reach.ok) {
      return reach.reason === 'ipConflict' || reach.reason === 'invalidHostAddress'
        ? { kind: 'addressProblem', reason: reach.reason }
        : { kind: 'unreachable' }
    }

    if (internetHosts.publicDnsServers.includes(server)) return this.lookup(name)
    const owner = DeviceLookup.answeringDevice(state, reach.path, server)
    if (owner?.kind === 'router' && owner.dnsForwarding === true) {
      // A forwarder needs the internet to answer; without WAN the query times out.
      return owner.wanUp === true ? this.lookup(name) : { kind: 'unreachable' }
    }
    // A local device that answers ping but runs no DNS; public non-resolvers simply time out.
    return owner ? { kind: 'notDns' } : { kind: 'unreachable' }
  }

  private lookup(name: string): DnsServerAnswer {
    const ip = internetHosts.names[DnsQuery.normalize(name)]
    return ip === undefined ? { kind: 'notFound' } : { kind: 'found', ip }
  }
}
