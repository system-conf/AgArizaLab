import type { NetworkState } from '../../../domain'
import { simTerminal, type CommandStart, type SimCommandOutcome, type SimMode, type WorkerJobs } from '../simulationServices'
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
}

/** Pending: the learner steps the request to its end (`steps`), or the Web Worker runs it (`worker`). */
export type CommandProgress = CommandResult | { readonly kind: 'pending'; readonly waitsFor: 'steps' | 'worker' }

/** A command that finished after `start` returned pending. */
export interface FinishedCommand {
  readonly deviceId: string
  readonly result: CommandResult | { readonly kind: 'cancelled' }
}

type Handle = { readonly kind: 'request'; readonly requestId: string } | { readonly kind: 'worker'; readonly jobId: number }

interface Pending {
  readonly deviceId: string
  readonly handle: Handle
}

/**
 * Terminal commands on the open lab's simulation (docs/SIMULATION.md §5.5, §10.1). Realtime: the command
 * runs to its end at once — on the player's engine, or for a large lab in the Web Worker from a snapshot
 * the player then adopts (the realtime clock waits meanwhile) — and its frames are replayed on the map.
 * Simulation: the request is queued at "now" and finishes as the learner steps; a step back or reset
 * that removes it cancels the command. Finished pending commands are announced to subscribers.
 */
export class SimulationTerminal {
  private readonly player: SimulationPlayer
  private readonly worker: WorkerJobs
  private readonly onReplay: (replay: RealtimeReplay | null) => void
  private pending: readonly Pending[] = []
  private readonly finished = new Map<number, CommandResult>()
  private readonly listeners = new Set<(command: FinishedCommand) => void>()
  /** Worker jobs run one after the other, each from the state the previous one left. */
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
    if (mode === 'simulation') {
      const { value } = this.player.act((engine) => simTerminal.start(engine, deviceId, line), true)
      return this.track(deviceId, value)
    }
    if (this.worker.usesWorker(this.player.labNetwork)) return this.startInWorker(deviceId, line)
    const acted = this.player.act((engine) => simTerminal.run(engine, deviceId, line), false)
    this.onReplay(RealtimeReplay.of(acted.transmissions, acted.events))
    return { kind: 'done', outcome: acted.value, labBefore: this.player.labNetwork }
  }

  private track(deviceId: string, start: CommandStart): CommandProgress {
    if (start.kind === 'done') return { kind: 'done', outcome: start.outcome, labBefore: this.player.labNetwork }
    this.pending = [...this.pending, { deviceId, handle: { kind: 'request', requestId: start.requestId } }]
    return { kind: 'pending', waitsFor: 'steps' }
  }

  private startInWorker(deviceId: string, line: string): CommandProgress {
    const jobId = this.nextJobId++
    this.pending = [...this.pending, { deviceId, handle: { kind: 'worker', jobId } }]
    this.chain = this.chain.then(async () => {
      const release = this.player.holdClock()
      try {
        const base = this.player.snapshot()
        const result = await this.worker.command({ snapshot: base, deviceId, line })
        // Refused when the lab was edited meanwhile: the lines still print, the effects reach the
        // document, and the engine follows the document from there.
        if (this.player.adopt(base, result.snapshot, result.events, result.transmissions)) {
          this.onReplay(RealtimeReplay.of(result.transmissions, result.events))
        }
        this.finished.set(jobId, { kind: 'done', outcome: result.outcome, labBefore: this.player.labNetwork })
      } finally {
        release()
        this.collect()
      }
    })
    return { kind: 'pending', waitsFor: 'worker' }
  }

  /** Announces every pending command that finished; re-entrant calls (a collect queues a request) wait. */
  private collect(): void {
    if (this.collecting) {
      this.collectAgain = true
      return
    }
    this.collecting = true
    try {
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
    } finally {
      this.collecting = false
    }
  }

  private progressOf(entry: Pending): { kind: 'waiting'; next?: Pending } | { kind: 'finished'; result: FinishedCommand['result'] } {
    const { handle } = entry
    if (handle.kind === 'worker') {
      const result = this.finished.get(handle.jobId)
      if (!result) return { kind: 'waiting' }
      this.finished.delete(handle.jobId)
      return { kind: 'finished', result }
    }
    const record = this.player.request(handle.requestId)
    if (!record) return { kind: 'finished', result: { kind: 'cancelled' } }
    if (record.status !== 'done') return { kind: 'waiting' }
    // The request ended: the command maps its result (and may queue its next request, e.g. ping after DNS).
    const { value } = this.player.act((engine) => simTerminal.collect(engine, handle.requestId), true)
    if (value.kind === 'done') return { kind: 'finished', result: { kind: 'done', outcome: value.outcome, labBefore: this.player.labNetwork } }
    return { kind: 'waiting', next: { deviceId: entry.deviceId, handle: { kind: 'request', requestId: value.requestId } } }
  }

  private announce(command: FinishedCommand): void {
    for (const listener of this.listeners) listener(command)
  }
}
