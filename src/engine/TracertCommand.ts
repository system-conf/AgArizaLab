import type { CommandResult, ReachResult } from '../domain/EngineContract'
import type { Device, NetworkState } from '../domain/NetworkTypes'
import type { CommandFormatter } from './CommandFormatter'
import { CommandOptions, type OptionSpec } from './CommandOptions'
import { DeviceLookup } from './DeviceLookup'
import type { DnsResolver } from './DnsResolver'
import { ProbeFailures } from './ProbeFailures'
import type { ReachabilityChecker } from './ReachabilityChecker'
import { ReplyTimings } from './ReplyTimings'
import { type TracertEnding, TracertFormatter, type TracertHop } from './TracertFormatter'

/** -d (no name lookup: the lab prints addresses anyway) and -4 are accepted and change nothing. */
const SPEC: OptionSpec = { flags: ['d', '4'], valued: [] }
/** A router answers the TTL-expired probe from the LAN side: "<1 ms". */
const ROUTER_HOP_MS = 0

interface TracertRoute {
  hops: TracertHop[]
  ending: TracertEnding
}

/**
 * `tracert [-d] [-4] <ip|name>`. Hops are the layer-3 devices of the reach trace: the router
 * (answering from the source's gateway address), then the destination. Switches and access points
 * are invisible to tracert; the internet adds no fictional ISP hops (router, then destination).
 */
export class TracertCommand {
  private readonly reachability: ReachabilityChecker
  private readonly dns: DnsResolver
  private readonly formatter: CommandFormatter
  private readonly tracertFormatter = new TracertFormatter()

  constructor(reachability: ReachabilityChecker, dns: DnsResolver, formatter: CommandFormatter) {
    this.reachability = reachability
    this.dns = dns
    this.formatter = formatter
  }

  run(state: NetworkState, device: Device, args: readonly string[]): CommandResult {
    const parsed = CommandOptions.parse(args, SPEC)
    if (!parsed.ok) return { lines: this.formatter.optionError(parsed.error, 'tracert') }
    const name = parsed.options.target

    const target = this.dns.resolveTarget(state, device.id, name)
    if (!target.ok) return { lines: this.tracertFormatter.hostNotFound(name), trace: { path: [device.id], ok: false } }

    const { result, reached } = this.reachability.trace(state, device.id, target.ip)
    const { hops, ending } = this.route(state, device, target.ip, result, reached)
    return {
      lines: this.tracertFormatter.tracert(target.ip, target.name, hops, ending),
      trace: { path: reached, ok: result.ok },
    }
  }

  private route(state: NetworkState, device: Device, targetIp: string, reach: ReachResult, reached: string[]): TracertRoute {
    const routerHops = this.routerHops(state, device, targetIp, reached)
    if (reach.ok) {
      // A destination in the sender's own segment answers in under a millisecond, like the router.
      const timing = ReplyTimings.forPath(state, targetIp, reach.path)
      const destination = { ip: targetIp, baseTimeMs: routerHops.length === 0 ? ROUTER_HOP_MS : timing.baseTimeMs }
      return { hops: [...routerHops, destination], ending: { kind: 'complete' } }
    }

    const ownIp = device.host?.ip ?? ''
    const failure = ProbeFailures.classify(reach, device.id)
    switch (failure.kind) {
      case 'generalFailure':
        return { hops: [], ending: { kind: 'generalFailure' } }
      case 'unreachable': {
        // The reporter's ICMP answer replaces its own hop line, so it is always hop 1:
        // "  1  192.168.1.1  reports: Destination host unreachable." (own IP for ARP failures).
        const reporterIp = failure.reporter === 'self' ? ownIp : (device.host?.gateway ?? ownIp)
        return { hops: [], ending: { kind: 'unreachable', reporterIp } }
      }
      case 'silent':
        return { hops: routerHops, ending: { kind: 'timedOut' } }
    }
  }

  /**
   * Routers the probes passed, excluding a router that is itself the destination.
   * The engine routes through at most one router (the source's gateway), so its hop address is
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
