import type { Device, NetworkState } from '../domain/NetworkTypes'
import { DeviceLookup } from './DeviceLookup'
import type { DnsResolver } from './DnsResolver'
import { ProbeFailures } from './ProbeFailures'
import { type ProbeReport, ProbeReports, type Prober, type ResolvedTarget } from './ProbeReports'
import type { ReachabilityChecker } from './ReachabilityChecker'
import { ReplyTimings } from './ReplyTimings'
import type { TracertHop } from './TracertFormatter'

/** A router answers the TTL-expired probe from the LAN side: "<1 ms". */
const ROUTER_HOP_MS = 0

/** ping / tracert probes on a v1 state: one router at most, answering from the sender's gateway. */
export class ProbeReporter implements Prober<NetworkState> {
  private readonly reachability: ReachabilityChecker
  private readonly dns: DnsResolver

  constructor(reachability: ReachabilityChecker, dns: DnsResolver) {
    this.reachability = reachability
    this.dns = dns
  }

  resolveTarget(state: NetworkState, deviceId: string, target: string): ResolvedTarget {
    return this.dns.resolveTarget(state, deviceId, target)
  }

  probe(state: NetworkState, deviceId: string, targetIp: string): ProbeReport {
    const device = DeviceLookup.require(state, deviceId)
    const { result, reached } = this.reachability.trace(state, deviceId, targetIp)
    const trace = { path: reached, ok: result.ok }
    const routerHops = this.routerHops(state, device, targetIp, reached)
    if (result.ok) return { trace, ...ProbeReports.success(targetIp, ReplyTimings.forPath(state, targetIp, result.path), routerHops) }

    const ownIp = device.host?.ip ?? ''
    const failure = ProbeFailures.classify(result, device.id)
    const reporterIp = device.host?.gateway ?? ownIp
    return { trace, ...ProbeReports.failure(failure, { ownIp, reporterIp, hopsBeforeReporter: [], hopsPassed: routerHops }) }
  }

  /**
   * Routers the probes passed, excluding a router that is itself the destination.
   * The v1 engine routes through at most one router (the source's gateway), so its hop address is
   * the gateway the source uses.
   */
  private routerHops(state: NetworkState, device: Device, targetIp: string, reached: string[]): TracertHop[] {
    const gateway = device.host?.gateway ?? ''
    return reached
      .slice(1)
      .map((deviceId) => DeviceLookup.find(state, deviceId))
      .filter((hop): hop is Device => hop?.kind === 'router' && !DeviceLookup.hasAddress(hop, targetIp))
      .map(() => ({ ip: gateway, baseTimeMs: ROUTER_HOP_MS }))
  }
}
