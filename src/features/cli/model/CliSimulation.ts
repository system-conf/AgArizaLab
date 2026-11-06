import type { NetworkState } from '../../../domain'
import type { DeviceRuntime, RequestRecord, SimRequest, SimulationEngine } from '../cliServices'

/** Builds a settled engine of a lab (the simulator's code loads on demand). */
export type CliEngineFactory = (network: NetworkState) => Promise<SimulationEngine>

/** What a console reads from the simulation: the device's tables and the virtual clock. */
export interface CliRuntimeView {
  readonly runtime: DeviceRuntime | undefined
  readonly now: number
}

const NO_RUNTIME: CliRuntimeView = { runtime: undefined, now: 0 }

/**
 * The simulation the device consoles read and run their jobs on (docs/CLI.md §4, §7): `show arp`,
 * `show mac address-table` and `show ip route` read its runtime tables; `ping`, `traceroute` and
 * `clear …` run their request on it. One engine per open lab, kept in step with the lab document and
 * run to idle after every change. Large labs (`autoLimit` devices and more) build it only for a job.
 */
export class CliSimulation {
  private readonly factory: CliEngineFactory
  private readonly autoLimit: number
  private labId: string | null = null
  private engine: SimulationEngine | null = null
  private building: Promise<SimulationEngine | null> | null = null
  private network: NetworkState | null = null

  constructor(factory: CliEngineFactory, autoLimit: number) {
    this.factory = factory
    this.autoLimit = autoLimit
  }

  /** Starts building the lab's engine in the background (small labs only). */
  prepare(labId: string, network: NetworkState): void {
    this.follow(labId)
    if (network.devices.length > this.autoLimit) return
    void this.ready(labId, network)
  }

  /** The device's runtime tables now; empty while the engine is still being built. */
  view(labId: string, network: NetworkState, deviceId: string): CliRuntimeView {
    this.follow(labId)
    const engine = this.engine
    if (!engine) return NO_RUNTIME
    this.sync(engine, network)
    return { runtime: engine.runtime(deviceId), now: engine.time }
  }

  /** Runs a console's request to its end; null when the simulation could not be built. */
  async run(labId: string, network: NetworkState, request: SimRequest): Promise<RequestRecord | null> {
    const engine = await this.ready(labId, network)
    if (!engine || this.labId !== labId) return null
    this.sync(engine, network)
    const requestId = engine.inject(request)
    engine.runUntilDone(requestId)
    return engine.request(requestId) ?? null
  }

  /** The device was reloaded: the next use builds a fresh engine (its runtime starts from scratch). */
  restart(labId: string): void {
    if (this.labId !== labId) return
    this.engine = null
    this.building = null
    this.network = null
  }

  private ready(labId: string, network: NetworkState): Promise<SimulationEngine | null> {
    this.follow(labId)
    if (this.engine) return Promise.resolve(this.engine)
    if (this.building) return this.building
    const building = this.factory(network).then(
      (engine) => {
        if (this.building !== building) return null
        this.engine = engine
        this.network = network
        this.building = null
        return engine
      },
      (error: unknown) => {
        console.error('The console simulation could not be built.', error)
        if (this.building === building) this.building = null
        return null
      },
    )
    this.building = building
    return building
  }

  private sync(engine: SimulationEngine, network: NetworkState): void {
    if (this.network === network) return
    this.network = network
    engine.reconfigure(network)
    engine.runUntilIdle()
  }

  private follow(labId: string): void {
    if (this.labId === labId) return
    this.labId = labId
    this.engine = null
    this.building = null
    this.network = null
  }
}
