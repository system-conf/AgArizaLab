import type { NetworkState } from '../../../domain'
import {
  PcapWriter,
  type EngineFactory,
  type PcapExport,
  type SimEvent,
  type SimRequest,
  type SimSnapshot,
  type SimTransmission,
  type SimulationEngine,
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

/** What the UI renders; a new object after every change (useSyncExternalStore snapshot). */
export interface PlayerView {
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

interface HistoryEntry {
  readonly snapshot: SimSnapshot
  readonly window: StepWindow | null
}

/**
 * Drives the one SimulationEngine of an open lab for the UI (docs/SIMULATION.md §5.5, §8): step forward
 * after pushing a snapshot, step back by restoring it, reset with a new engine, keep the engine in step
 * with the lab after edits, run to idle when the user switches to realtime, run terminal commands and
 * take over work done in the Web Worker. Observable for React.
 */
export class SimulationPlayer {
  private engine: SimulationEngine
  private logs: EngineLogs
  private network: NetworkState
  private readonly createEngine: EngineFactory
  private readonly history: StepHistory<HistoryEntry>
  private window: StepWindow | null = null
  private serial = 0
  private clockHolds = 0
  private view: PlayerView
  private readonly listeners = new Set<() => void>()

  constructor(createEngine: EngineFactory, network: NetworkState, depth: number = STEP_HISTORY_DEPTH) {
    this.createEngine = createEngine
    this.network = network
    this.engine = createEngine(network)
    this.logs = new EngineLogs(this.engine)
    this.history = new StepHistory(depth)
    this.view = this.buildView()
  }

  /** For useSyncExternalStore (stable function identity). */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly getView = (): PlayerView => this.view

  /** One `'instant'` step: every task at the next point in time; null when nothing is queued. */
  stepForward(): StepWindow | null {
    if (this.engine.isIdle()) return null
    const from = this.engine.time
    this.history.push({ snapshot: this.engine.snapshot(), window: this.window })
    const result = this.engine.step('instant')
    this.window = this.nextWindow(from, result.time, true)
    this.changed()
    return this.window
  }

  stepBack(): boolean {
    const entry = this.history.pop()
    if (!entry) return false
    this.engine.restore(entry.snapshot)
    this.logs.truncate(entry.snapshot)
    this.window = entry.window ? this.nextWindow(entry.window.from, entry.window.to, false) : null
    this.changed()
    return true
  }

  /** A fresh engine of the current lab (or `network`): empty logs, no history. */
  reset(network: NetworkState = this.network): void {
    this.network = network
    this.engine = this.createEngine(network)
    this.logs = new EngineLogs(this.engine)
    this.history.clear()
    this.window = null
    this.changed()
  }

  /** Queues a request at the current virtual time; returns its id (= flow id). */
  inject(request: SimRequest): string {
    const id = this.engine.inject(request)
    this.changed()
    return id
  }

  /**
   * The user edited the lab: the engine follows; history before the edit is dropped (it would undo it).
   * A lab that already equals the engine's configuration (the document took over the simulation's DHCP
   * effects) changes nothing.
   */
  reconfigure(network: NetworkState): void {
    if (network === this.network) return
    this.network = network
    if (network === this.engine.network()) return
    this.engine.reconfigure(network)
    this.history.clear()
    this.window = null
    this.changed()
  }

  /** Switching to realtime: the queue runs to idle at once (docs/SIMULATION.md §5.5). */
  runToIdle(): void {
    if (this.engine.isIdle()) return
    this.engine.runUntilIdle()
    this.history.clear()
    this.window = null
    this.changed()
  }

  /**
   * Realtime clock: processes everything up to virtual `time` (wall time mapped 1:1 by the caller).
   * Subscribers hear about it only when something happened, so an idle clock does not re-render.
   * The clock stands still while a command runs in the Web Worker (`holdClock`).
   */
  advanceTo(time: number): void {
    if (this.clockHolds > 0 || time <= this.engine.time) return
    const result = this.engine.runUntil(time)
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
   */
  act<Value>(action: (engine: SimulationEngine) => Value, keepHistory: boolean): Acted<Value> {
    const value = action(this.engine)
    const logged = this.logs.pull(this.engine)
    if (!keepHistory) {
      this.history.clear()
      this.window = null
    }
    this.changed()
    return { value, ...logged }
  }

  /** The engine's state for work in the Web Worker; pass it back to `adopt`. */
  snapshot(): SimSnapshot {
    return this.engine.snapshot()
  }

  /**
   * Takes over a command simulated in the Web Worker from `base`: the engine continues from `result`
   * with the worker's logs. Refused (false) when the engine moved on meanwhile (an edit, a reset).
   */
  adopt(base: SimSnapshot, result: SimSnapshot, events: readonly SimEvent[], transmissions: readonly SimTransmission[]): boolean {
    if (this.engine.snapshot() !== base) return false
    this.engine.restore(result)
    this.logs.add(result, events, transmissions)
    this.history.clear()
    this.window = null
    this.changed()
    return true
  }

  /** The request of a terminal command; undefined once a step back or reset removed it. */
  request(requestId: string): ReturnType<SimulationEngine['request']> {
    return this.engine.request(requestId)
  }

  get time(): number {
    return this.engine.time
  }

  /** The lab document state the engine follows (the last `reconfigure`). */
  get labNetwork(): NetworkState {
    return this.network
  }

  /** The retained wire frames as a libpcap file; `startEpochMs` = wall time of virtual time 0. */
  exportPcap(startEpochMs: number): PcapExport {
    return PcapWriter.write(this.logs.transmissions, { startEpochMs })
  }

  private nextWindow(from: number, to: number, animate: boolean): StepWindow {
    this.serial += 1
    return { from, to, serial: this.serial, animate }
  }

  private buildView(): PlayerView {
    return {
      time: this.engine.time,
      events: this.logs.events,
      transmissions: this.logs.transmissions,
      window: this.window,
      canStepBack: this.history.canPop,
      canStepForward: !this.engine.isIdle(),
    }
  }

  private changed(): void {
    this.logs.pull(this.engine)
    this.view = this.buildView()
    for (const listener of this.listeners) listener()
  }
}
