// Test-only (O3): the oracle contract of docs/SIMULATION.md §10.2 for one lab: rule engine vs simulator
// for reach (ping), tracert, resolve, DHCP renew and AppLinks. Returns mismatches instead of throwing
// so a property can print the whole picture of a failing lab; skips go through Divergences.
import type { NetworkState } from '../../domain'
import {
  DnsResolver,
  networkEngine,
  ProbeReporter,
  ReachabilityChecker,
  SegmentFinder,
  Topology,
  type TracertRoute,
} from '../../engine'
import type { DhcpAdapterResult, TracertResult } from '../contract'
import { type Divergence, Divergences } from './Divergences'
import { OracleSimulation } from './OracleSimulation'

export interface Mismatch {
  property: 'ping' | 'pingPath' | 'pingReason' | 'tracert' | 'resolve' | 'renew' | 'appLink' | 'appLinkReason' | 'terminal'
  deviceId: string
  /** Target address, name or '' (renew). */
  target: string
  engine: unknown
  sim: unknown
}

/** How many comparisons ran and how many were skipped per divergence. */
export class OracleTally {
  readonly compared: Record<string, number> = {}
  readonly skipped: Partial<Record<Divergence, number>> = {}

  count(property: string): void {
    this.compared[property] = (this.compared[property] ?? 0) + 1
  }

  skip(divergence: Divergence): void {
    this.skipped[divergence] = (this.skipped[divergence] ?? 0) + 1
  }
}

const reachability = new ReachabilityChecker(new SegmentFinder())
const prober = new ProbeReporter(reachability, new DnsResolver(reachability))

/** Engine reasons that mean "the packet never left" (§10.2: localFailure with the same reason). */
const LOCAL_REASONS = new Set(['cableDisconnected', 'portDisabled', 'noIpAddress', 'invalidConfig', 'invalidHostAddress', 'ipConflict', 'gatewayNotSet'])

const DHCP_FAILURES: Readonly<Record<string, string>> = {
  dhcpNoServer: 'requestTimedOut',
  dhcpPoolExhausted: 'requestTimedOut',
  cableDisconnected: 'cableDisconnected',
  portDisabled: 'portDisabled',
  invalidConfig: 'invalidConfig',
}

export class OracleChecks {
  readonly sim: OracleSimulation
  private readonly state: NetworkState
  private readonly tally: OracleTally

  constructor(state: NetworkState, tally: OracleTally) {
    this.state = state
    this.sim = new OracleSimulation(state)
    this.tally = tally
  }

  /** §10.2 reach rows: outcome class, addresses, reason, path; TTL unless §10.3.2. */
  ping(fromId: string, targetIp: string): Mismatch[] {
    const reach = networkEngine.reach(this.state, fromId, targetIp)
    if (Divergences.gatewayNotRouter(this.state, fromId, targetIp, reach)) {
      this.tally.skip('gatewayNotRouter')
      return []
    }
    this.tally.count('ping')
    const expected = prober.probe(this.state, fromId, targetIp)
    const sim = this.sim.ping(fromId, targetIp)
    const mismatch = (property: Mismatch['property'], engine: unknown, simValue: unknown): Mismatch[] => [
      { property, deviceId: fromId, target: targetIp, engine, sim: simValue },
    ]
    if (!reach.ok && reach.reason === 'powerOff') {
      return sim.outcome.kind === 'aborted' ? [] : mismatch('ping', reach, sim.outcome)
    }
    if (sim.outcome.kind === 'aborted') return mismatch('ping', expected.ping, sim.outcome)
    const engineOutcome = expected.ping
    const simOutcome = sim.outcome
    if (engineOutcome.kind === 'reply' && simOutcome.kind === 'reply') {
      const ttlSkipped = Divergences.replyTtl(this.state, targetIp, sim.routers)
      if (ttlSkipped) this.tally.skip('replyTtl')
      const same = engineOutcome.fromIp === simOutcome.fromIp && engineOutcome.baseTimeMs === simOutcome.baseTimeMs && (ttlSkipped || engineOutcome.ttl === simOutcome.ttl)
      if (!same) return mismatch('ping', engineOutcome, simOutcome)
      return JSON.stringify(expected.trace.path) === JSON.stringify(sim.trace.path) ? [] : mismatch('pingPath', expected.trace.path, sim.trace.path)
    }
    if (JSON.stringify(engineOutcome) !== JSON.stringify(simOutcome)) return mismatch('ping', { reach, outcome: engineOutcome }, { echo: sim.echo, outcome: simOutcome })
    if (!reach.ok && LOCAL_REASONS.has(reach.reason) && reach.atDeviceId === fromId) {
      const reason = sim.echo?.kind === 'localFailure' ? sim.echo.reason : null
      if (reason !== reach.reason) return mismatch('pingReason', reach, sim.echo)
    }
    return []
  }

  /** ping / tracert text rows of §10.2 for tracert: hop addresses and ending (times are derived from hops). */
  tracert(fromId: string, targetIp: string): Mismatch[] {
    const reach = networkEngine.reach(this.state, fromId, targetIp)
    if (!reach.ok && reach.reason === 'powerOff') {
      this.tally.skip('sourceOff')
      return []
    }
    if (Divergences.gatewayNotRouter(this.state, fromId, targetIp, reach)) {
      this.tally.skip('gatewayNotRouter')
      return []
    }
    if (Divergences.tracertRouterReports(fromId, reach)) {
      this.tally.skip('tracertRouterReports')
      return []
    }
    this.tally.count('tracert')
    const engine = OracleChecks.routeView(prober.probe(this.state, fromId, targetIp).route)
    const sim = OracleChecks.simRouteView(this.sim.tracert(fromId, targetIp).result)
    return engine === sim ? [] : [{ property: 'tracert', deviceId: fromId, target: targetIp, engine, sim }]
  }

  /** §10.2 resolve row: equal ResolveResult. */
  resolve(fromId: string, name: string): Mismatch[] {
    if (!Topology.of(this.state).require(fromId).powered) {
      this.tally.skip('sourceOff')
      return []
    }
    if (Divergences.deepDnsChain(this.state)) {
      this.tally.skip('deepDnsChain')
      return []
    }
    this.tally.count('resolve')
    const engine = networkEngine.resolve(this.state, fromId, name)
    const sim = this.sim.resolve(fromId, name)
    const answer = sim.result?.answer ?? { aborted: sim.aborted }
    return JSON.stringify(engine) === JSON.stringify(answer) ? [] : [{ property: 'resolve', deviceId: fromId, target: name, engine, sim: answer }]
  }

  /** §10.2 renew row: same address and resulting network, or the matching adapter failure. */
  renew(clientId: string): Mismatch[] {
    const divergence = Divergences.dhcp(this.state, clientId)
    if (divergence) {
      this.tally.skip(divergence)
      return []
    }
    this.tally.count('renew')
    const engine = networkEngine.renewDhcp(this.state, clientId)
    const sim = this.sim.renew(clientId)
    const adapters: readonly DhcpAdapterResult[] = sim.result?.adapters ?? []
    const mismatch: Mismatch[] = [{ property: 'renew', deviceId: clientId, target: '', engine, sim: sim.aborted ? 'aborted' : adapters }]
    if (engine.ok) {
      const leased = adapters.find((adapter): adapter is Extract<DhcpAdapterResult, { ip: string }> => adapter.ok && 'ip' in adapter)
      if (leased?.ip !== engine.ip) return mismatch
      const same = JSON.stringify(engine.nextState) === JSON.stringify(sim.network)
      return same ? [] : [{ property: 'renew', deviceId: clientId, target: 'nextState', engine: engine.nextState, sim: sim.network }]
    }
    if (engine.reason === 'powerOff') return sim.aborted ? [] : mismatch
    const failure = adapters.find((adapter): adapter is Extract<DhcpAdapterResult, { reason: string }> => !adapter.ok)
    const okAdapter = adapters.some((adapter) => adapter.ok)
    return !okAdapter && failure?.reason === DHCP_FAILURES[engine.reason] ? [] : mismatch
  }

  /** §10.2 appLinkStatus row: I3's SimAppLinks (§10.1) gives the engine's ok and reason. */
  appLinks(deviceId: string): Mismatch[] {
    const engineStatuses = networkEngine.appLinkStatus(this.state, deviceId)
    if (engineStatuses.length === 0) return []
    const simStatuses = this.sim.appLinks(deviceId)
    const mismatches: Mismatch[] = []
    engineStatuses.forEach((engine, index) => {
      const reach = networkEngine.reach(this.state, deviceId, engine.targetIp)
      if (Divergences.gatewayNotRouter(this.state, deviceId, engine.targetIp, reach)) {
        this.tally.skip('gatewayNotRouter')
        return
      }
      this.tally.count('appLink')
      const sim = simStatuses[index]
      const base = { deviceId, target: engine.targetIp, engine, sim }
      if (sim?.ok !== engine.ok) mismatches.push({ property: 'appLink', ...base })
      else if (sim.reason !== engine.reason) mismatches.push({ property: 'appLinkReason', ...base })
    })
    return mismatches
  }

  /** "ip ip ip | ending" of the engine's route. */
  private static routeView(route: TracertRoute): string {
    const ending = route.ending.kind === 'unreachable' ? `unreachable ${route.ending.reporterIp}` : route.ending.kind
    return `${route.hops.map((hop) => hop.ip).join(' ')} | ${ending}`
  }

  /** §10.1 tracert mapping: hop = first answering probe; trailing silent hops are the timeout lines. */
  private static simRouteView(result: TracertResult | null): string {
    if (!result?.ending) return 'aborted'
    const hops = result.hops.map((hop) => {
      const answer = hop.probes.find((probe) => probe.kind !== 'timeout')
      return answer && 'fromIp' in answer ? answer.fromIp : '*'
    })
    const ending = result.ending
    switch (ending.kind) {
      case 'reached':
        return `${hops.join(' ')} | complete`
      case 'unreachable':
        return `${hops.slice(0, -1).join(' ')} | unreachable ${ending.reporterIp}`
      case 'silent':
        return `${OracleChecks.withoutTrailingSilence(hops).join(' ')} | timedOut`
      case 'hopLimit':
        return `${hops.join(' ')} | hopLimit`
      case 'localFailure':
        return ` | generalFailure`
    }
  }

  private static withoutTrailingSilence(hops: string[]): string[] {
    const last = hops.findLastIndex((hop) => hop !== '*')
    return hops.slice(0, last + 1)
  }
}
