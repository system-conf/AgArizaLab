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

interface HistoryEntry {
  readonly snapshot: SimSnapshot
  readonly window: StepWindow | null
}

/**
 * Drives one SimulationEngine for the UI (docs/SIMULATION.md §5.5, §8): step forward after pushing a
 * snapshot, step back by restoring it, reset with a new engine, keep the engine in step with the lab
 * after edits, and run to idle when the user switches to realtime. Observable for React.
 */
export class SimulationPlayer {
  private engine: SimulationEngine
  private network: NetworkState
  private readonly createEngine: EngineFactory
  private readonly history: StepHistory<HistoryEntry>
  private window: StepWindow | null = null
  private serial = 0
  private view: PlayerView
  private readonly listeners = new Set<() => void>()

  constructor(createEngine: EngineFactory, network: NetworkState, depth: number = STEP_HISTORY_DEPTH) {
    this.createEngine = createEngine
    this.network = network
    this.engine = createEngine(network)
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
    this.window = entry.window ? this.nextWindow(entry.window.from, entry.window.to, false) : null
    this.changed()
    return true
  }

  /** A fresh engine of the current lab (or `network`): empty logs, no history. */
  reset(network: NetworkState = this.network): void {
    this.network = network
    this.engine = this.createEngine(network)
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

  /** The user edited the lab: the engine follows; history before the edit is dropped (it would undo it). */
  reconfigure(network: NetworkState): void {
    if (network === this.network) return
    this.network = network
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
   */
  advanceTo(time: number): void {
    if (time <= this.engine.time) return
    const result = this.engine.runUntil(time)
    if (result.processedTasks > 0) this.changed()
  }

  get time(): number {
    return this.engine.time
  }

  /** The retained wire frames as a libpcap file; `startEpochMs` = wall time of virtual time 0. */
  exportPcap(startEpochMs: number): PcapExport {
    return PcapWriter.write(this.engine.transmissions(), { startEpochMs })
  }

  private nextWindow(from: number, to: number, animate: boolean): StepWindow {
    this.serial += 1
    return { from, to, serial: this.serial, animate }
  }

  private buildView(): PlayerView {
    return {
      time: this.engine.time,
      events: this.engine.events(),
      transmissions: this.engine.transmissions(),
      window: this.window,
      canStepBack: this.history.canPop,
      canStepForward: !this.engine.isIdle(),
    }
  }

  private changed(): void {
    this.view = this.buildView()
    for (const listener of this.listeners) listener()
  }
}
