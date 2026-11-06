// The simulator's heavy jobs (docs/SIMULATION.md §5.5, BACKLOG item 6): run in the Web Worker
// (simWorker.ts) for large labs, or directly on the main thread (tests, small labs). Plain data in and
// out: everything crosses the worker boundary by structured clone.
import type { NetworkState, SolveCondition } from '../domain'
import type { ConditionResult } from '../engine'
import {
  createSimulation,
  SimSolveChecker,
  SimTerminal,
  type SimCommandOutcome,
  type SimEvent,
  type SimSnapshot,
  type SimTransmission,
  type SimulationEngine,
  type SimulationOptions,
} from '../sim'

/** A realtime terminal command simulated from `snapshot`. */
export interface CommandJob {
  readonly snapshot: SimSnapshot
  readonly deviceId: string
  readonly line: string
}

/** What a command job hands back: the outcome, where the engine ended and what it logged. */
export interface CommandJobResult {
  readonly outcome: SimCommandOutcome
  readonly snapshot: SimSnapshot
  readonly events: readonly SimEvent[]
  readonly transmissions: readonly SimTransmission[]
}

/** A lab's engine built and settled off the main thread: restore `snapshot` on a blank engine. */
export interface PreparedSimulation {
  readonly snapshot: SimSnapshot
  /** The start-up traffic hit its budget (`SimulationEngine.settleTruncated`); the snapshot does not carry it. */
  readonly settleTruncated: boolean
}

const EMPTY_NETWORK: NetworkState = { devices: [], links: [] }

/**
 * Runs jobs on one reusable engine: the kernel's whole state is its snapshot (the layers keep none), so
 * restoring a snapshot turns the engine into the caller's engine at that moment.
 */
export class SimJobs {
  private engine: SimulationEngine | null = null
  private readonly options: SimulationOptions

  /** `options`: of the engines `prepare` builds (tests: a small settle budget). */
  constructor(options: SimulationOptions = {}) {
    this.options = options
  }

  solve(state: NetworkState, conditions: readonly SolveCondition[]): ConditionResult[] {
    return SimSolveChecker.check(state, conditions)
  }

  /** Builds and settles the engine of a lab (opening a large lab). */
  prepare(state: NetworkState): PreparedSimulation {
    const engine = createSimulation(state, this.options)
    return { snapshot: engine.snapshot(), settleTruncated: engine.settleTruncated }
  }

  command(job: CommandJob): CommandJobResult {
    const engine = this.engineAt(job.snapshot)
    const { event, transmission } = job.snapshot.counters
    const outcome = SimTerminal.run(engine, job.deviceId, job.line)
    return { outcome, snapshot: engine.snapshot(), events: engine.events(event), transmissions: engine.transmissions(transmission) }
  }

  private engineAt(snapshot: SimSnapshot): SimulationEngine {
    const engine = this.engine ?? createSimulation(EMPTY_NETWORK, { settle: false })
    this.engine = engine
    engine.restore(snapshot)
    return engine
  }
}
