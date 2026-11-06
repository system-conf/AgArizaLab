// Main-thread side of the simulator's Web Worker (docs/SIMULATION.md §5.5, BACKLOG item 6).
//
// The split: the stepping player (Simulation mode, the realtime clock, the Simple PDU tool) stays on the
// main thread — one step is a handful of tasks. Two jobs that can take long on a large lab go to the
// worker: exercise verification (`SimSolveChecker.check` builds and settles fresh engines) and realtime
// terminal commands (`SimTerminal.run` runs a request to its end). Small labs and environments without
// workers (tests) run them synchronously on the main thread.
import type { NetworkState, SolveCondition } from '../domain'
import type { ConditionResult } from '../engine'
import { SimJobs, type CommandJob, type CommandJobResult } from './simJobs'
import type { SimWorkerRequest, SimWorkerResponse } from './simWorkerProtocol'

/** Labs with at least this many devices are simulated in the worker. */
export const WORKER_MIN_DEVICES = 30

/** The part of `Worker` the client uses (a test double can stand in). */
export interface WorkerPort {
  onmessage: ((event: MessageEvent<SimWorkerResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: SimWorkerRequest): void
  terminate(): void
}

export interface SimWorkerClientOptions {
  readonly minDevices?: number
  /** null when the environment has no workers. */
  readonly createWorker?: () => WorkerPort | null
}

interface Waiting {
  resolve(response: SimWorkerResponse): void
  reject(error: Error): void
}

function createBrowserWorker(): WorkerPort | null {
  if (typeof Worker === 'undefined') return null
  return new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module', name: 'simulation' })
}

export class SimWorkerClient {
  private readonly minDevices: number
  private readonly createWorker: () => WorkerPort | null
  private readonly jobs = new SimJobs()
  private readonly waiting = new Map<number, Waiting>()
  private worker: WorkerPort | null = null
  /** The worker failed to load: everything runs on the main thread from then on. */
  private broken = false
  private nextId = 1

  constructor(options: SimWorkerClientOptions = {}) {
    this.minDevices = options.minDevices ?? WORKER_MIN_DEVICES
    this.createWorker = options.createWorker ?? createBrowserWorker
  }

  /** Whether jobs on this lab go to the worker (large lab, worker available). */
  usesWorker(state: NetworkState): boolean {
    return !this.broken && state.devices.length >= this.minDevices && this.port() !== null
  }

  /** Verification of solve conditions; in the worker for large labs. */
  solve(state: NetworkState, conditions: readonly SolveCondition[]): Promise<ConditionResult[]> {
    if (!this.usesWorker(state)) return Promise.resolve(this.jobs.solve(state, conditions))
    return this.post({ id: this.nextId++, kind: 'solve', state, conditions }).then((response) => {
      if (response.kind !== 'solve') throw new Error(`Simulation worker answered ${response.kind} to solve`)
      return response.results
    }, (error: unknown) => this.retryHere(error, () => this.jobs.solve(state, conditions)))
  }

  /** A realtime terminal command; always in the worker (callers check `usesWorker` first), else here. */
  command(job: CommandJob): Promise<CommandJobResult> {
    if (this.broken || this.port() === null) return Promise.resolve(this.jobs.command(job))
    return this.post({ id: this.nextId++, kind: 'command', ...job }).then((response) => {
      if (response.kind !== 'command') throw new Error(`Simulation worker answered ${response.kind} to a command`)
      return response.result
    }, (error: unknown) => this.retryHere(error, () => this.jobs.command(job)))
  }

  /** The worker failed the job: the main thread runs it (the same plain data gives the same result). */
  private retryHere<Result>(error: unknown, job: () => Result): Result {
    console.warn('Simulation worker job failed; running it on the main thread', error)
    return job()
  }

  private port(): WorkerPort | null {
    if (this.worker || this.broken) return this.worker
    const worker = this.createWorker()
    if (!worker) {
      this.broken = true
      return null
    }
    worker.onmessage = (event) => this.answer(event.data)
    worker.onerror = (event) => this.fail(event.message)
    this.worker = worker
    return worker
  }

  private post(request: SimWorkerRequest): Promise<SimWorkerResponse> {
    const worker = this.port()
    if (!worker) return Promise.reject(new Error('Simulation worker is not available'))
    return new Promise((resolve, reject) => {
      this.waiting.set(request.id, { resolve, reject })
      worker.postMessage(request)
    })
  }

  private answer(response: SimWorkerResponse): void {
    const waiting = this.waiting.get(response.id)
    if (!waiting) return
    this.waiting.delete(response.id)
    if (response.kind === 'error') waiting.reject(new Error(response.message))
    else waiting.resolve(response)
  }

  /** The worker could not load or crashed: reject what waits, run later jobs on the main thread. */
  private fail(message: string): void {
    console.warn(`Simulation worker failed, continuing on the main thread: ${message}`)
    this.broken = true
    this.worker?.terminate()
    this.worker = null
    const waiting = [...this.waiting.values()]
    this.waiting.clear()
    for (const entry of waiting) entry.reject(new Error(message))
  }
}

/** The app's one client (one worker, created on first use). */
export const simWorkerClient = new SimWorkerClient()
