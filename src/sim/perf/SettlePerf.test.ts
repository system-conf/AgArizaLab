// Settle (start-up traffic) on big flat labs (docs/SIMULATION.md §5.6). Every host's duplicate-address
// probe floods the whole segment, so the tasks grow with n²; the cost per task must not grow with the lab.
import { describe, expect, it } from 'vitest'
import { createSimulation } from '../createSimulation'
import { flatTestLab } from './flatTestLab'

/**
 * Measured 2026-11-06 on a dev machine (node 24): 200 devices ~0.25 s (38 000 tasks), 500 devices ~1.0 s
 * (240 000 tasks), both well inside the targets (< 1 s, < 5 s); before the bounded kernel 9 s and "never".
 * Under the full parallel test run the same work took up to 5x longer, so the bounds sit above the targets:
 * they guard against a per-task cost that grows with the lab again (that made 200 devices take 9 s), and
 * the fastest run counts.
 */
const CEILING_MS: Readonly<Record<number, number>> = { 200: 2500, 500: 15_000 }

function fastestOf(runs: number, work: () => void): number {
  let fastest = Number.POSITIVE_INFINITY
  for (let run = 0; run < runs; run += 1) {
    const started = performance.now()
    work()
    fastest = Math.min(fastest, performance.now() - started)
  }
  return fastest
}

describe('settle performance', () => {
  for (const [size, runs] of [
    [200, 3],
    [500, 2],
  ] as const) {
    it(`settles a ${size}-device flat lab completely within ${CEILING_MS[size]} ms`, { timeout: 120_000 }, () => {
      const lab = flatTestLab(size)
      expect(lab.devices).toHaveLength(size)
      let truncated = true
      let tasks = 0
      const fastest = fastestOf(runs, () => {
        const engine = createSimulation(lab)
        truncated = engine.settleTruncated
        tasks = engine.snapshot().counters.seq
      })
      console.info(`settle ${size} devices: ${tasks} tasks, fastest ${fastest.toFixed(0)} ms (${((fastest * 1000) / tasks).toFixed(1)} µs/task)`)
      expect(truncated).toBe(false)
      expect(fastest).toBeLessThan(CEILING_MS[size] ?? 0)
    })
  }
})
