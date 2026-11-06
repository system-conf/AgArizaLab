import type { NetworkState } from '../domain'
import { ProbeFailures } from './ProbeFailures'
import { type ProbeReport, ProbeReports, type Prober, type ResolvedTarget } from './ProbeReports'
import { ReplyTimings } from './ReplyTimings'
import { TracertFormatter, type TracertHop } from './TracertFormatter'
import { DeviceAddresses } from './DeviceAddresses'
import type { DnsResolver } from './DnsResolver'
import type { ReachabilityChecker } from './ReachabilityChecker'
import { type ReachTrace, ReachTraces, type RouterHop } from './ReachTrace'
import { Topology } from './Topology'

/** Does a router's "TTL expired" answer get back to the sender? */
type Answers = (hop: RouterHop) => boolean

/**
 * ping / tracert probes on a network state: every router on the way is a hop, answering from the address
 * the probe arrived on, if it has a route back to the sender (else "*"). The first router answers in
 * under a millisecond, each further one a little later (fixed values: deterministic engine).
 */
export class ProbeReporter implements Prober {
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
    const reach = this.reachability.trace(state, deviceId, targetIp)
    const { result } = reach
    const trace = { path: reach.reached, ok: result.ok }
    const answers = this.answers(state, reach.sourceIp)
    const passed = this.forwardingHops(state, reach.routerHops, targetIp)
    if (result.ok) {
      return { trace, ...ProbeReports.success(targetIp, ReplyTimings.forRouters(targetIp, passed.length), this.tracertHops(passed, answers)) }
    }

    const failure = ProbeFailures.classify({ ...result, silent: reach.silent }, deviceId)
    if (result.reason === 'ttlExpired') {
      // Tracert walks the loop up to its hop limit whether or not the ping's "TTL expired" gets back.
      const looping = Array.from({ length: TracertFormatter.maxHops }, (_, index) => ReachTraces.hopAt(reach, index))
      const hops = looping.filter((hop): hop is RouterHop => hop !== undefined)
      const view = { ownIp: reach.sourceIp, reporterIp: reach.expiredAtIp ?? '', hopsBeforeReporter: [], hopsPassed: this.tracertHops(hops, answers) }
      const { ping, route } = ProbeReports.failure({ kind: 'ttlExpired' }, view)
      return { trace, ping: failure.kind === 'silent' ? { kind: 'timeout' } : ping, route }
    }
    const reporterIndex = reach.routerHops.findLastIndex((hop) => hop.deviceId === result.atDeviceId)
    const reporterIp = reach.routerHops[reporterIndex]?.ip ?? this.gatewayOf(state, deviceId, reach)
    const view = {
      ownIp: reach.sourceIp,
      reporterIp,
      hopsBeforeReporter: this.tracertHops(reach.routerHops.slice(0, Math.max(0, reporterIndex)), answers),
      hopsPassed: this.tracertHops(passed, answers),
    }
    return { trace, ...ProbeReports.failure(failure, view) }
  }

  /** Routers that forwarded the probe, without a router that is itself the destination. */
  private forwardingHops(state: NetworkState, hops: readonly RouterHop[], targetIp: string): RouterHop[] {
    const topology = Topology.of(state)
    return hops.filter((hop) => {
      const device = topology.find(hop.deviceId)
      return device !== undefined && !DeviceAddresses.has(device, targetIp)
    })
  }

  /** A router's ICMP answer reaches the sender only if the router can route back to it (asked once per router). */
  private answers(state: NetworkState, sourceIp: string): Answers {
    const known = new Map<string, boolean>()
    return (hop) => {
      let answered = known.get(hop.deviceId)
      if (answered === undefined) {
        answered = sourceIp !== '' && this.reachability.canSend(state, hop.deviceId, sourceIp)
        known.set(hop.deviceId, answered)
      }
      return answered
    }
  }

  /** Router n (0-based) answers after n ms ("<1 ms" for the first); null = its answer is lost. */
  private tracertHops(hops: readonly RouterHop[], answers: Answers): (TracertHop | null)[] {
    return hops.map((hop, index) => (answers(hop) ? { ip: hop.ip, baseTimeMs: index } : null))
  }

  private gatewayOf(state: NetworkState, deviceId: string, reach: ReachTrace): string {
    return Topology.of(state).find(deviceId)?.host?.defaultGateway ?? reach.sourceIp
  }
}
