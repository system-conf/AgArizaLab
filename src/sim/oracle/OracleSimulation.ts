// Test-only (O3): runs single requests on a fresh, settled simulator (docs/SIMULATION.md §10.2: "fresh
// engine, settle") and maps the client results the way §10.1 describes, so the oracle tests can compare
// them with the rule engine. The engine is `createSimulation` (default wiring, §11 wave 3.2).
import type { AppLinkStatus, NetworkState, PacketTrace } from '../../domain'
import { ReplyTimings, type PingOutcome } from '../../engine'
import type {
  DhcpResult,
  DnsResult,
  EchoResult,
  RequestRecord,
  SimEvent,
  SimRequest,
  SimSnapshot,
  SimulationEngine,
  TracertResult,
} from '../contract'
import { createSimulation } from '../createSimulation'
import { SimAppLinks, SimTerminal, type SimCommandOutcome } from '../terminal'

/** Tasks one request may take before the oracle calls it a hang (a bug in itself). */
const TASK_LIMIT = 200_000

export interface SimRun<Result> {
  record: RequestRecord
  result: Result | null
  engine: SimulationEngine
}

/** First echo of a ping, mapped to the engine's terminal outcome (§10.1), plus what the oracle needs. */
export interface SimPingView {
  /** `aborted` when the kernel ended the request (device off). */
  outcome: PingOutcome | { kind: 'aborted' }
  echo: EchoResult | null
  trace: PacketTrace
  /** Distinct routers that forwarded / buffered / sent the echo request at layer 3 (§10.1 + S1 addition 2). */
  routers: number
}

/**
 * One lab on the simulator. Every request starts from the same freshly created, settled engine: the
 * snapshot taken right after `create` is restored first (restore truncates the logs, so each run sees only
 * its own events), which equals a fresh engine per request at a fraction of the cost.
 */
export class OracleSimulation {
  private readonly engine: SimulationEngine
  private readonly fresh: SimSnapshot

  constructor(network: NetworkState) {
    this.engine = createSimulation(network)
    this.fresh = this.engine.snapshot()
  }

  run<Result>(request: SimRequest): SimRun<Result> {
    const engine = this.engine
    engine.restore(this.fresh)
    const id = engine.inject(request)
    const run = engine.runUntilDone(id, TASK_LIMIT)
    const record = engine.request(id)
    if (!record || record.status !== 'done') {
      throw new Error(`request ${request.kind} on ${request.deviceId} did not finish (stopped by ${run.stoppedBy})`)
    }
    return { record, result: record.result as Result | null, engine }
  }

  /** A terminal command line on the fresh engine (I3's SimTerminal, run to its end). */
  terminal(deviceId: string, commandLine: string): SimCommandOutcome {
    this.engine.restore(this.fresh)
    return SimTerminal.run(this.engine, deviceId, commandLine)
  }

  /** I3's app-link status (§10.1) on the fresh engine. */
  appLinks(deviceId: string): AppLinkStatus[] {
    this.engine.restore(this.fresh)
    return SimAppLinks.status(this.engine, deviceId)
  }

  ping(deviceId: string, targetIp: string): SimPingView {
    const { record, result, engine } = this.run<{ kind: 'ping'; echoes: readonly EchoResult[] }>({
      kind: 'ping',
      deviceId,
      targetIp,
      count: 1,
      size: 32,
    })
    if (record.aborted) return { outcome: { kind: 'aborted' }, echo: null, trace: { path: [], ok: false }, routers: 0 }
    const echo = result?.echoes[0] ?? null
    if (echo === null) throw new Error(`ping ${deviceId} → ${targetIp}: done without an echo`)
    const events = 'requestPduId' in echo ? engine.events().filter((event) => event.pduId === echo.requestPduId) : []
    const routers = OracleSimulation.routerCount(events, deviceId)
    return {
      outcome: OracleSimulation.outcome(echo, targetIp, routers),
      echo,
      trace: { path: OracleSimulation.path(events, deviceId), ok: echo.kind === 'reply' },
      routers,
    }
  }

  tracert(deviceId: string, targetIp: string): { aborted: boolean; result: TracertResult | null } {
    const { record, result } = this.run<TracertResult>({
      kind: 'tracert',
      deviceId,
      targetIp,
      maxHops: 30,
      probesPerHop: 3,
      maxSilentHops: 4,
    })
    return { aborted: record.aborted !== undefined, result }
  }

  resolve(deviceId: string, name: string): { aborted: boolean; result: DnsResult | null } {
    const { record, result } = this.run<DnsResult>({ kind: 'dnsQuery', deviceId, name })
    return { aborted: record.aborted !== undefined, result }
  }

  renew(deviceId: string): { aborted: boolean; result: DhcpResult | null; network: NetworkState } {
    const { record, result, engine } = this.run<DhcpResult>({ kind: 'dhcpRenew', deviceId })
    return { aborted: record.aborted !== undefined, result, network: engine.network() }
  }

  /** §10.1 ping mapping (first echo). */
  private static outcome(echo: EchoResult, targetIp: string, routers: number): PingOutcome {
    switch (echo.kind) {
      case 'reply':
        return { kind: 'reply', fromIp: echo.fromIp, ttl: echo.ttl, baseTimeMs: ReplyTimings.forRouters(targetIp, routers).baseTimeMs }
      case 'unreachable':
        return { kind: 'unreachable', fromIp: echo.fromIp }
      case 'ttlExpired':
        return { kind: 'ttlExpired', fromIp: echo.fromIp }
      case 'timeout':
        return { kind: 'timeout' }
      case 'localFailure':
        return { kind: 'generalFailure' }
    }
  }

  private static routerCount(events: readonly SimEvent[], sourceId: string): number {
    const routers = new Set<string>()
    for (const event of events) {
      // The sender itself may buffer its own packet while it waits for ARP: not a router hop.
      if (event.layer !== 3 || event.deviceId === sourceId) continue
      if (event.action === 'forwarded' || event.action === 'buffered' || event.action === 'sent') routers.add(event.deviceId)
    }
    return routers.size
  }

  /**
   * §10.1: devices of the echo request's events in order, up to the delivering / dropping device. Flood
   * copies that a device discards because they are not for it are not part of the packet's way.
   */
  private static path(events: readonly SimEvent[], sourceId: string): string[] {
    const path: string[] = []
    for (const event of events) {
      if (event.action === 'dropped' && event.reason === 'notForThisInterface') continue
      if (event.action === 'sent' && path.at(-1) === event.deviceId) continue
      path.push(event.deviceId)
    }
    return path.length === 0 ? [sourceId] : path
  }
}
