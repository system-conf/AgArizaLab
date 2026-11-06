import type { NetworkState } from '../../../domain'
import type {
  PcapExport,
  SimEvent,
  SimRequest,
  SimSnapshot,
  SimTransmission,
  SimulationEngine,
  SimulationRuntime,
} from '../simulationServices'
import { EngineLogs } from './EngineLogs'
import { StepHistory } from './StepHistory'

/** Snapshots kept for step back (the contract asks for at least 100). */
export const STEP_HISTORY_DEPTH = 200

/**
 * The virtual time span the map animates: packets move from where they were at `from` to where they
 * are at `to`. `serial` changes with every step (restarts the animation); `animate` is false after a
 * step back or a reset (packets are shown where they are, without moving).
 */
export interface StepWindow {
  readonly from: number
  readonly to: number
  readonly serial: number
  readonly animate: boolean
}

/**
 * `dormant`: no engine yet, built when asked (`prepare`; very large labs); `preparing`: being built (the
 * simulator's code loads, or the Web Worker settles a large lab); `ready`: the engine runs.
 */
export type PlayerStatus = 'dormant' | 'preparing' | 'ready'

/** What the UI renders; a new object after every change (useSyncExternalStore snapshot). */
export interface PlayerView {
  readonly status: PlayerStatus
  /** The engine stopped its start-up traffic at the settle budget; the rest runs with the first steps. */
  readonly settleTruncated: boolean
  readonly time: number
  readonly events: readonly SimEvent[]
  readonly transmissions: readonly SimTransmission[]
  readonly window: StepWindow | null
  readonly canStepBack: boolean
  /** Something is queued: a step would do work. */
  readonly canStepForward: boolean
}

/** The value of an action on the engine and what it logged. */
export interface Acted<Value> {
  readonly value: Value
  readonly events: readonly SimEvent[]
  readonly transmissions: readonly SimTransmission[]
}

/** A lab's settled engine and the simulator code that built it. */
export interface PlayerEngine {
  readonly engine: SimulationEngine
  readonly runtime: SimulationRuntime
  /** `SimulationEngine.settleTruncated` of the engine as it was built (a restored engine does not know it). */
  readonly settleTruncated: boolean
}

/** Builds the settled engine of a lab: at once (tests, small labs once the code is loaded) or later. */
export type EngineBuild = (network: NetworkState) => PlayerEngine | Promise<PlayerEngine>

export interface PlayerOptions {
  readonly depth?: number
  /** false: no engine until `prepare` is called (very large labs start on demand). Default true. */
  readonly startNow?: boolean
}

interface HistoryEntry {
  readonly snapshot: SimSnapshot
  readonly window: StepWindow | null
}

/**
 * Drives the one SimulationEngine of an open lab for the UI (docs/SIMULATION.md §5.5, §8): builds it
 * (possibly off the main thread, the lab stays editable meanwhile), steps forward after pushing a
 * snapshot, steps back by restoring it, resets with a new engine, keeps the engine in step with the lab
 * after edits, runs to idle when the user switches to realtime, runs terminal commands and takes over
 * work done in the Web Worker. Observable for React.
 */
export class SimulationPlayer {
  private active: PlayerEngine | null = null
  private logs: EngineLogs | null = null
  private status: PlayerStatus = 'dormant'
  private settleTruncated = false
  private network: NetworkState
  private readonly build: EngineBuild
  private readonly history: StepHistory<HistoryEntry>
  /** Changes with every reset: a build that finishes for an older generation is dropped. */
  private generation = 0
  private preparing: Promise<boolean> | null = null
  private window: StepWindow | null = null
  private serial = 0
  private clockHolds = 0
  private view: PlayerView
  private readonly listeners = new Set<() => void>()

  constructor(build: EngineBuild, network: NetworkState, options: PlayerOptions = {}) {
    this.build = build
    this.network = network
    this.history = new StepHistory(options.depth ?? STEP_HISTORY_DEPTH)
    this.view = this.buildView()
    if (options.startNow ?? true) void this.prepare()
  }

  /** For useSyncExternalStore (stable function identity). */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly getView = (): PlayerView => this.view

  /**
   * Builds the engine unless it exists or is being built; resolves true once it runs, false when a reset
   * replaced it meanwhile or the build failed (logged; the next call tries again).
   */
  prepare(): Promise<boolean> {
    if (this.active) return Promise.resolve(true)
    if (this.preparing) return this.preparing
    const generation = this.generation
    const network = this.network
    const built = this.build(network)
    if (!(built instanceof Promise)) {
      this.install(built, network)
      return Promise.resolve(true)
    }
    this.status = 'preparing'
    this.changed()
    const preparing = built.then(
      (engine) => {
        if (generation !== this.generation) return false
        this.install(engine, network)
        return true
      },
      (error: unknown) => {
        if (generation !== this.generation) return false
        console.error('The simulation could not be prepared', error)
        this.preparing = null
        this.status = 'dormant'
        this.changed()
        return false
      },
    )
    this.preparing = preparing
    return preparing
  }

  /** One `'instant'` step: every task at the next point in time; null when nothing is queued. */
  stepForward(): StepWindow | null {
    const engine = this.active?.engine
    if (!engine || engine.isIdle()) return null
    const from = engine.time
    this.history.push({ snapshot: engine.snapshot(), window: this.window })
    const result = engine.step('instant')
    this.window = this.nextWindow(from, result.time, true)
    this.changed()
    return this.window
  }

  stepBack(): boolean {
    const entry = this.history.pop()
    if (!entry || !this.active || !this.logs) return false
    this.active.engine.restore(entry.snapshot)
    this.logs.truncate(entry.snapshot)
    this.window = entry.window ? this.nextWindow(entry.window.from, entry.window.to, false) : null
    this.changed()
    return true
  }

  /**
   * A fresh engine of the current lab (or `network`): empty logs, no history. Built at once unless
   * `startNow` is false (a very large lab opened: on demand).
   */
  reset(network: NetworkState = this.network, startNow = true): void {
    this.generation += 1
    this.network = network
    this.active = null
    this.logs = null
    this.preparing = null
    this.status = 'dormant'
    this.settleTruncated = false
    this.history.clear()
    this.window = null
    this.changed()
    if (startNow) void this.prepare()
  }

  /** Queues a request at the current virtual time; returns its id (= flow id), null before the engine runs. */
  inject(request: SimRequest): string | null {
    const engine = this.active?.engine
    if (!engine) return null
    const id = engine.inject(request)
    this.changed()
    return id
  }

  /**
   * The user edited the lab: the engine follows; history before the edit is dropped (it would undo it).
   * A lab that already equals the engine's configuration (the document took over the simulation's DHCP
   * effects, or gave them back after a step back) changes nothing. Before the engine runs, the edit is
   * kept and the engine follows it once built.
   */
  reconfigure(network: NetworkState): void {
    if (network === this.network) return
    this.network = network
    const engine = this.active?.engine
    if (!engine || network === engine.network()) return
    engine.reconfigure(network)
    this.history.clear()
    this.window = null
    this.changed()
  }

  /** Switching to realtime: the queue runs to idle at once (docs/SIMULATION.md §5.5). */
  runToIdle(): void {
    const engine = this.active?.engine
    if (!engine || engine.isIdle()) return
    engine.runUntilIdle()
    this.history.clear()
    this.window = null
    this.changed()
  }

  /**
   * Realtime clock: processes everything up to virtual `time` (wall time mapped 1:1 by the caller).
   * Subscribers hear about it only when something happened, so an idle clock does not re-render.
   * The clock stands still while a command runs in the Web Worker (`holdClock`) and before the engine runs.
   */
  advanceTo(time: number): void {
    const engine = this.active?.engine
    if (!engine || this.clockHolds > 0 || time <= engine.time) return
    const result = engine.runUntil(time)
    if (result.processedTasks > 0) this.changed()
  }

  /** Stops the realtime clock until the returned release is called (once). */
  holdClock(): () => void {
    this.clockHolds += 1
    let released = false
    return () => {
      if (released) return
      released = true
      this.clockHolds -= 1
    }
  }

  /**
   * Runs `action` on the engine (terminal commands) and returns what it logged. Simulation mode keeps
   * the step history (`keepHistory`, e.g. a queued request); a realtime run that moves the clock drops it.
   * Only once the engine runs (`ready`).
   */
  act<Value>(action: (engine: SimulationEngine, runtime: SimulationRuntime) => Value, keepHistory: boolean): Acted<Value> {
    const { engine, runtime } = this.require()
    const value = action(engine, runtime)
    const logged = this.logs?.pull(engine) ?? { events: [], transmissions: [] }
    if (!keepHistory) {
      this.history.clear()
      this.window = null
    }
    this.changed()
    return { value, ...logged }
  }

  /** The engine's state for work in the Web Worker; pass it back to `adopt`. Only once the engine runs. */
  snapshot(): SimSnapshot {
    return this.require().engine.snapshot()
  }

  /**
   * Takes over a command simulated in the Web Worker from `base`: the engine continues from `result`
   * with the worker's logs. Refused (false) when the engine moved on meanwhile (an edit, a reset).
   */
  adopt(base: SimSnapshot, result: SimSnapshot, events: readonly SimEvent[], transmissions: readonly SimTransmission[]): boolean {
    const engine = this.active?.engine
    if (!engine || !this.logs || engine.snapshot() !== base) return false
    engine.restore(result)
    this.logs.add(result, events, transmissions)
    this.history.clear()
    this.window = null
    this.changed()
    return true
  }

  /** The request of a terminal command; undefined once a step back or reset removed it. */
  request(requestId: string): ReturnType<SimulationEngine['request']> {
    return this.active?.engine.request(requestId)
  }

  get ready(): boolean {
    return this.active !== null
  }

  /** The simulator's code, once the engine runs. */
  get runtime(): SimulationRuntime | null {
    return this.active?.runtime ?? null
  }

  get time(): number {
    return this.active?.engine.time ?? 0
  }

  /** The lab document state the engine follows (the last `reconfigure`). */
  get labNetwork(): NetworkState {
    return this.network
  }

  /** The engine's configuration: the lab plus the simulation's effects at the current step. */
  get engineNetwork(): NetworkState {
    return this.active?.engine.network() ?? this.network
  }

  /** The retained wire frames as a libpcap file; `startEpochMs` = wall time of virtual time 0. Null before the engine runs. */
  exportPcap(startEpochMs: number): PcapExport | null {
    if (!this.active || !this.logs) return null
    return this.active.runtime.writePcap(this.logs.transmissions, startEpochMs)
  }

  private require(): PlayerEngine {
    if (!this.active) throw new Error('The simulation engine is not ready yet')
    return this.active
  }

  /** The built engine takes over; a lab edited while it was built is applied first. */
  private install(built: PlayerEngine, builtFrom: NetworkState): void {
    const { engine } = built
    if (this.network !== builtFrom && this.network !== engine.network()) engine.reconfigure(this.network)
    this.active = built
    this.logs = new EngineLogs(engine)
    this.preparing = null
    this.status = 'ready'
    this.settleTruncated = built.settleTruncated
    this.history.clear()
    this.window = null
    this.changed()
  }

  private nextWindow(from: number, to: number, animate: boolean): StepWindow {
    this.serial += 1
    return { from, to, serial: this.serial, animate }
  }

  private buildView(): PlayerView {
    const engine = this.active?.engine
    return {
      status: this.status,
      settleTruncated: this.settleTruncated,
      time: engine?.time ?? 0,
      events: this.logs?.events ?? [],
      transmissions: this.logs?.transmissions ?? [],
      window: this.window,
      canStepBack: this.history.canPop,
      canStepForward: engine ? !engine.isIdle() : false,
    }
  }

  private changed(): void {
    const engine = this.active?.engine
    if (engine) this.logs?.pull(engine)
    this.view = this.buildView()
    for (const listener of this.listeners) listener()
  }
}
