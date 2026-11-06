import type { NetworkState, PacketTrace } from '../domain'
import { Ipv4 } from './Ipv4'
import type { PingOutcome } from './PingFormatter'
import type { ProbeFailure } from './ProbeFailures'
import type { ReplyTiming } from './ReplyTimings'
import type { TracertEnding, TracertHop } from './TracertFormatter'

/** Hop lines and ending of a tracert. */
export interface TracertRoute {
  hops: TracertHop[]
  ending: TracertEnding
}

/** What one echo probe to an address found: map trace, ping outcome and tracert route. */
export interface ProbeReport {
  trace: PacketTrace
  ping: PingOutcome
  route: TracertRoute
}

/** A ping / tracert target: an IPv4 address as typed, or a name resolved to one. */
export type ResolvedTarget = { ok: true; ip: string; name: string | null } | { ok: false }

/**
 * Network side of ping and tracert: resolves the target and probes it. The commands themselves
 * (PingCommand, TracertCommand) only parse options and format the reports.
 */
export interface Prober {
  resolveTarget(state: NetworkState, deviceId: string, target: string): ResolvedTarget
  probe(state: NetworkState, deviceId: string, targetIp: string): ProbeReport
}

/** Addresses a failed probe is reported with. */
export interface FailureView {
  /** The sender's address ('' when it has none). */
  ownIp: string
  /** Address of the router that reported or dropped the packet. */
  reporterIp: string
  /** Routers before the reporting router (tracert hop lines above its "reports:" line). */
  hopsBeforeReporter: readonly TracertHop[]
  /** Every router the probe passed (silent drops), or the looping hops up to the hop limit. */
  hopsPassed: readonly TracertHop[]
}

/** Builds ping outcomes and tracert routes from probe results. */
export class ProbeReports {
  /** An address is used as is; anything else is looked up as a name (`name` is then set). */
  static target(target: string, resolve: (name: string) => { ok: true; ip: string } | { ok: false }): ResolvedTarget {
    if (Ipv4.isValid(target)) return { ok: true, ip: target, name: null }
    const resolved = resolve(target)
    return resolved.ok ? { ok: true, ip: resolved.ip, name: target } : { ok: false }
  }

  /**
   * The destination answered. A destination in the sender's own segment answers in under a
   * millisecond, like a router; behind routers it takes the routed time.
   */
  static success(targetIp: string, timing: ReplyTiming, routerHops: readonly TracertHop[]): Omit<ProbeReport, 'trace'> {
    const destination: TracertHop = { ip: targetIp, baseTimeMs: routerHops.length === 0 ? 0 : timing.baseTimeMs }
    return {
      ping: { kind: 'reply', fromIp: targetIp, ...timing },
      route: { hops: [...routerHops, destination], ending: { kind: 'complete' } },
    }
  }

  static failure(failure: ProbeFailure, view: FailureView): Omit<ProbeReport, 'trace'> {
    switch (failure.kind) {
      case 'generalFailure':
        return { ping: { kind: 'generalFailure' }, route: { hops: [], ending: { kind: 'generalFailure' } } }
      case 'unreachable': {
        // The reporter's ICMP answer replaces its own hop line: "  n  192.168.1.1  reports: …".
        const reporterIp = failure.reporter === 'self' ? view.ownIp : view.reporterIp
        const hops = failure.reporter === 'self' ? [] : [...view.hopsBeforeReporter]
        return { ping: { kind: 'unreachable', fromIp: reporterIp }, route: { hops, ending: { kind: 'unreachable', reporterIp } } }
      }
      case 'silent':
        return { ping: { kind: 'timeout' }, route: { hops: [...view.hopsPassed], ending: { kind: 'timedOut' } } }
      case 'ttlExpired':
        return {
          ping: { kind: 'ttlExpired', fromIp: view.reporterIp },
          route: { hops: [...view.hopsPassed], ending: { kind: 'hopLimit' } },
        }
    }
  }
}
