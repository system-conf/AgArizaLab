import { describe, expect, it } from 'vitest'
import { LIVE_CHECK_DELAY_MS, LiveCheckScheduler, type TimerPort } from './LiveCheckScheduler'

/** Manual clock: timers fire only when the test advances time. */
class FakeTimers implements TimerPort {
  now = 0
  private next = 1
  private readonly timers = new Map<number, { at: number; callback: () => void }>()

  set(callback: () => void, delayMs: number): number {
    const handle = this.next++
    this.timers.set(handle, { at: this.now + delayMs, callback })
    return handle
  }

  clear(handle: number): void {
    this.timers.delete(handle)
  }

  get active(): number {
    return this.timers.size
  }

  advance(ms: number): void {
    this.now += ms
    for (const [handle, timer] of [...this.timers]) {
      if (timer.at > this.now) continue
      this.timers.delete(handle)
      timer.callback()
    }
  }
}

function setup(delayMs?: number) {
  const timers = new FakeTimers()
  const runs: string[] = []
  const results: string[] = []
  const scheduler = new LiveCheckScheduler<string, string>(
    (input) => {
      runs.push(input)
      return `checked ${input}`
    },
    (output) => results.push(output),
    { timers, ...(delayMs === undefined ? {} : { delayMs }) },
  )
  return { timers, runs, results, scheduler }
}

describe('LiveCheckScheduler', () => {
  it('checks once after the quiet time, with the latest input only', () => {
    const { timers, runs, results, scheduler } = setup()
    scheduler.schedule('a')
    timers.advance(LIVE_CHECK_DELAY_MS - 100)
    scheduler.schedule('b')
    timers.advance(LIVE_CHECK_DELAY_MS - 100)
    scheduler.schedule('c')
    expect(runs).toEqual([])
    expect(scheduler.pending).toBe(true)
    timers.advance(LIVE_CHECK_DELAY_MS)
    expect(runs).toEqual(['c'])
    expect(results).toEqual(['checked c'])
    expect(scheduler.pending).toBe(false)
  })

  it('never waits less than 300 ms (contract)', () => {
    const { timers, runs, scheduler } = setup(50)
    scheduler.schedule('a')
    timers.advance(299)
    expect(runs).toEqual([])
    timers.advance(1)
    expect(runs).toEqual(['a'])
  })

  it('does not check the same input object twice in a row', () => {
    const { timers, runs, scheduler } = setup()
    scheduler.schedule('a')
    timers.advance(LIVE_CHECK_DELAY_MS)
    scheduler.schedule('a')
    expect(scheduler.pending).toBe(false)
    expect(timers.active).toBe(0)
    scheduler.schedule('b')
    scheduler.schedule('a')
    timers.advance(LIVE_CHECK_DELAY_MS)
    expect(runs).toEqual(['a'])
  })

  it('flushes a waiting check at once', () => {
    const { timers, runs, scheduler } = setup()
    scheduler.schedule('a')
    scheduler.flush()
    expect(runs).toEqual(['a'])
    expect(timers.active).toBe(0)
    scheduler.flush()
    expect(runs).toEqual(['a'])
  })

  it('stops after dispose', () => {
    const { timers, runs, scheduler } = setup()
    scheduler.schedule('a')
    scheduler.dispose()
    timers.advance(LIVE_CHECK_DELAY_MS)
    scheduler.schedule('b')
    timers.advance(LIVE_CHECK_DELAY_MS)
    expect(runs).toEqual([])
    expect(timers.active).toBe(0)
  })
})
