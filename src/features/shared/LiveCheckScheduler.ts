/** Timer functions the scheduler uses (window timers; fake ones in tests). */
export interface TimerPort {
  set(callback: () => void, delayMs: number): number
  clear(handle: number): void
}

const browserTimers: TimerPort = {
  set: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clear: (handle) => window.clearTimeout(handle),
}

/** Quiet time after the last change before a live check runs (design contract: ≥ 300 ms). */
export const LIVE_CHECK_DELAY_MS = 400

export interface LiveCheckSchedulerOptions {
  delayMs?: number
  timers?: TimerPort
}

/**
 * Debounces a live check of the lab: design requirements (docs/DESIGN_EXERCISES.md §6.3) and sample
 * steps (docs/SAMPLE_LABS.md). A change starts the quiet time again, and only the latest input is
 * checked once it has settled. An input that is the same object as the last checked one is not
 * checked again.
 */
export class LiveCheckScheduler<Input, Output> {
  private readonly run: (input: Input) => Output
  private readonly onResult: (output: Output, input: Input) => void
  private readonly delayMs: number
  private readonly timers: TimerPort
  private timer: number | null = null
  private waiting: { input: Input } | null = null
  private lastChecked: { input: Input } | null = null
  private disposed = false

  constructor(run: (input: Input) => Output, onResult: (output: Output, input: Input) => void, options: LiveCheckSchedulerOptions = {}) {
    this.run = run
    this.onResult = onResult
    this.delayMs = Math.max(300, options.delayMs ?? LIVE_CHECK_DELAY_MS)
    this.timers = options.timers ?? browserTimers
  }

  /** A check is waiting for the quiet time to pass. */
  get pending(): boolean {
    return this.waiting !== null
  }

  /** Plans a check of `input`; replaces a waiting one and restarts the quiet time. */
  schedule(input: Input): void {
    if (this.disposed) return
    this.cancelTimer()
    if (this.lastChecked !== null && this.lastChecked.input === input) {
      this.waiting = null
      return
    }
    this.waiting = { input }
    this.timer = this.timers.set(() => this.flush(), this.delayMs)
  }

  /** Runs a waiting check now (e.g. before submitting). */
  flush(): void {
    this.cancelTimer()
    const waiting = this.waiting
    if (waiting === null || this.disposed) return
    this.waiting = null
    const output = this.run(waiting.input)
    this.lastChecked = waiting
    this.onResult(output, waiting.input)
  }

  /** Stops every future check (component unmounted). */
  dispose(): void {
    this.disposed = true
    this.cancelTimer()
    this.waiting = null
  }

  private cancelTimer(): void {
    if (this.timer === null) return
    this.timers.clear(this.timer)
    this.timer = null
  }
}
