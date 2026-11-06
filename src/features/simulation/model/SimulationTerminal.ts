import type { NetworkState } from '../../../domain'
import type { CommandStart, SimCommandOutcome, SimMode, SimulationRuntime, WorkerJobs } from '../simulationServices'
import { RealtimeReplay } from './RealtimeReplay'
import type { SimulationPlayer } from './SimulationPlayer'

/** A finished command: its outcome, and the lab the engine started from (see `CommandResult.labBefore`). */
export interface CommandResult {
  readonly kind: 'done'
  readonly outcome: SimCommandOutcome
  /**
   * The lab document state the engine followed when the command ended. A document still at this state
   * takes `outcome.nextState` as it is (the engine already holds it); a document edited meanwhile gets
   * `outcome.effects` applied to its own state.
   */
  readonly labBefore: NetworkState
  /** The document state after the command, given the document's `latest` state (the rule above). */
  stateAfter(latest: NetworkState): NetworkState
}

/**
 * A step back undid a finished command that changed the lab (a DHCP lease): the document goes back to
 * `restoredState`, the engine's configuration at that step. `waitsAgain`: the command's request is
 * still queued, so it is announced again when the learner steps forward to its end.
 */
export interface RevertedCommand {
  readonly kind: 'reverted'
  readonly restoredState: NetworkState
  readonly waitsAgain: boolean
}

/** Pending: the learner steps the request to its end (`steps`), the Web Worker runs it (`worker`), or the simulation is being built (`preparing`). */
export type CommandProgress = CommandResult | { readonly kind: 'pending'; readonly waitsFor: 'steps' | 'worker' | 'preparing' }

/** A command that finished, was cancelled or was undone by a step back, after `start` returned. */
export interface FinishedCommand {
  readonly deviceId: string
  readonly result: CommandResult | RevertedCommand | { readonly kind: 'cancelled' }
}

type Handle = { readonly kind: 'request'; readonly requestId: string } | { readonly kind: 'job'; readonly jobId: number }

interface Pending {
  readonly deviceId: string
  readonly handle: Handle
}

/** A finished command that changed the lab, from a request the learner stepped to its end. */
interface Applied {
  readonly deviceId: string
  readonly requestId: string
}

/** How an asynchronous job (worker run, start after the engine was built) ended. */
type JobEnd = { readonly kind: 'result'; readonly result: CommandResult | { readonly kind: 'cancelled' } } | { readonly kind: 'continue'; readonly handle: Handle }

const CANCELLED: JobEnd = { kind: 'result', result: { kind: 'cancelled' } }

function commandResult(outcome: SimCommandOutcome, labBefore: NetworkState, runtime: SimulationRuntime): CommandResult {
  return {
    kind: 'done',
    outcome,
    labBefore,
    stateAfter: (latest) => {
      if (!outcome.nextState) return latest
      return latest === labBefore ? outcome.nextState : runtime.applyEffects(latest, outcome.effects)
    },
  }
}

/**
 * Terminal commands on the open lab's simulation (docs/SIMULATION.md §5.5, §10.1). Realtime: the command
 * runs to its end at once — on the player's engine, or for a large lab in the Web Worker from a snapshot
 * the player then adopts (the realtime clock waits meanwhile) — and its frames are replayed on the map.
 * Simulation: the request is queued at "now" and finishes as the learner steps; a step back or reset
 * that removes it cancels the command, a step back before the end of a command that changed the lab
 * reverts the change and announces the command again at its end. Before the engine runs, commands wait
 * for it (and ask for it: a very large lab starts on demand). Finished pending commands are announced.
 */
export class SimulationTerminal {
  private readonly player: SimulationPlayer
  private readonly worker: WorkerJobs
  private readonly onReplay: (replay: RealtimeReplay | null) => void
  private pending: readonly Pending[] = []
  private applied: readonly Applied[] = []
  private readonly finished = new Map<number, JobEnd>()
  private readonly listeners = new Set<(command: FinishedCommand) => void>()
  /** Jobs run one after the other, each from the state the previous one left. */
  private chain: Promise<void> = Promise.resolve()
  private nextJobId = 1
  private collecting = false
  private collectAgain = false

  constructor(player: SimulationPlayer, worker: WorkerJobs, onReplay: (replay: RealtimeReplay | null) => void) {
    this.player = player
    this.worker = worker
    this.onReplay = onReplay
    player.subscribe(() => this.collect())
  }

  readonly subscribe = (listener: (command: FinishedCommand) => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(deviceId: string, line: string, mode: SimMode): CommandProgress {
    const { runtime } = this.player
    if (!runtime) return this.later(deviceId, { kind: 'pending', waitsFor: 'preparing' }, () => this.startReady(deviceId, line, mode))
    if (mode === 'simulation') return this.track(deviceId, this.startQueued(deviceId, line, runtime))
    if (this.worker.usesWorker(this.player.labNetwork)) return this.later(deviceId, { kind: 'pending', waitsFor: 'worker' }, () => this.runInWorker(deviceId, line))
    return this.runHere(deviceId, line, runtime)
  }

  private startQueued(deviceId: string, line: string, runtime: SimulationRuntime): CommandStart {
    return this.player.act((engine) => runtime.terminal.start(engine, deviceId, line), true).value
  }

  private runHere(deviceId: string, line: string, runtime: SimulationRuntime): CommandResult {
    const acted = this.player.act((engine) => runtime.terminal.run(engine, deviceId, line), false)
    this.onReplay(RealtimeReplay.of(acted.transmissions, acted.events))
    return commandResult(acted.value, this.player.labNetwork, runtime)
  }

  private track(deviceId: string, start: CommandStart): CommandProgress {
    const { runtime } = this.player
    if (start.kind === 'done' && runtime) return commandResult(start.outcome, this.player.labNetwork, runtime)
    if (start.kind === 'done') throw new Error('A command finished without the simulation')
    this.pending = [...this.pending, { deviceId, handle: { kind: 'request', requestId: start.requestId } }]
    return { kind: 'pending', waitsFor: 'steps' }
  }

  /** Queues `job` after the jobs before it; the command is pending until it ends. */
  private later(deviceId: string, progress: CommandProgress, job: () => Promise<JobEnd>): CommandProgress {
    const jobId = this.nextJobId++
    this.pending = [...this.pending, { deviceId, handle: { kind: 'job', jobId } }]
    this.chain = this.chain
      .then(job)
      .catch((error: unknown) => {
        console.error('A simulation terminal command failed', error)
        return CANCELLED
      })
      .then((end) => {
        this.finished.set(jobId, end)
        this.collect()
      })
    return progress
  }

  /** The engine was not built when the command was typed: wait for it, then start in `mode`. */
  private async startReady(deviceId: string, line: string, mode: SimMode): Promise<JobEnd> {
    if (!(await this.player.prepare())) return CANCELLED
    const { runtime } = this.player
    if (!runtime) return CANCELLED
    if (mode === 'simulation') {
      const start = this.startQueued(deviceId, line, runtime)
      if (start.kind === 'pending') return { kind: 'continue', handle: { kind: 'request', requestId: start.requestId } }
      return { kind: 'result', result: commandResult(start.outcome, this.player.labNetwork, runtime) }
    }
    if (this.worker.usesWorker(this.player.labNetwork)) return this.runInWorker(deviceId, line)
    return { kind: 'result', result: this.runHere(deviceId, line, runtime) }
  }

  private async runInWorker(deviceId: string, line: string): Promise<JobEnd> {
    const { runtime } = this.player
    if (!runtime) return CANCELLED
    const release = this.player.holdClock()
    try {
      const base = this.player.snapshot()
      const result = await this.worker.command({ snapshot: base, deviceId, line })
      // Refused when the lab was edited meanwhile: the lines still print, the effects reach the
      // document, and the engine follows the document from there.
      if (this.player.adopt(base, result.snapshot, result.events, result.transmissions)) {
        this.onReplay(RealtimeReplay.of(result.transmissions, result.events))
      }
      return { kind: 'result', result: commandResult(result.outcome, this.player.labNetwork, runtime) }
    } finally {
      release()
    }
  }

  /** Announces every pending command that finished; re-entrant calls (a collect queues a request) wait. */
  private collect(): void {
    if (this.collecting) {
      this.collectAgain = true
      return
    }
    this.collecting = true
    try {
      this.revertUndone()
      do {
        this.collectAgain = false
        const still: Pending[] = []
        for (const entry of this.pending) {
          const result = this.progressOf(entry)
          if (result.kind === 'waiting') still.push(result.next ?? entry)
          else this.announce({ deviceId: entry.deviceId, result: result.result })
        }
        this.pending = still
      } while (this.collectAgain)
      if (!this.player.getView().canStepBack) this.applied = []
    } finally {
      this.collecting = false
    }
  }

  /**
   * A step back went to before the end of commands that changed the lab: their changes are reverted
   * (newest first) and the ones whose request is still queued wait for the steps again.
   */
  private revertUndone(): void {
    if (!this.player.ready) {
      this.applied = []
      return
    }
    const kept: Applied[] = []
    const undone: Applied[] = []
    for (const entry of this.applied) {
      if (this.player.request(entry.requestId)?.status === 'done') kept.push(entry)
      else undone.push(entry)
    }
    if (undone.length === 0) return
    this.applied = kept
    const restoredState = this.player.engineNetwork
    for (const entry of undone.reverse()) {
      const waitsAgain = this.player.request(entry.requestId) !== undefined
      if (waitsAgain) this.pending = [...this.pending, { deviceId: entry.deviceId, handle: { kind: 'request', requestId: entry.requestId } }]
      this.announce({ deviceId: entry.deviceId, result: { kind: 'reverted', restoredState, waitsAgain } })
    }
  }

  private progressOf(entry: Pending): { kind: 'waiting'; next?: Pending } | { kind: 'finished'; result: FinishedCommand['result'] } {
    const { handle } = entry
    if (handle.kind === 'job') {
      const end = this.finished.get(handle.jobId)
      if (!end) return { kind: 'waiting' }
      this.finished.delete(handle.jobId)
      if (end.kind === 'continue') return this.progressOf({ deviceId: entry.deviceId, handle: end.handle })
      return { kind: 'finished', result: end.result }
    }
    const record = this.player.request(handle.requestId)
    const { runtime } = this.player
    if (!record || !runtime) return { kind: 'finished', result: { kind: 'cancelled' } }
    if (record.status !== 'done') return { kind: 'waiting', next: entry }
    // The request ended: the command maps its result (and may queue its next request, e.g. ping after DNS).
    const { value } = this.player.act((engine) => runtime.terminal.collect(engine, handle.requestId), true)
    if (value.kind === 'pending') return { kind: 'waiting', next: { deviceId: entry.deviceId, handle: { kind: 'request', requestId: value.requestId } } }
    if (value.outcome.nextState) this.applied = [...this.applied, { deviceId: entry.deviceId, requestId: handle.requestId }]
    return { kind: 'finished', result: commandResult(value.outcome, this.player.labNetwork, runtime) }
  }

  private announce(command: FinishedCommand): void {
    for (const listener of this.listeners) listener(command)
  }
}
