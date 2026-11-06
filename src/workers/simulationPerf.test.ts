// Timings behind the Web Worker split (docs/SIMULATION.md §5.5, BACKLOG item 6) on a 100-device lab.
// Bounds are loose (CI machines vary); the printed numbers go into the wave report.
import { describe, expect, it } from 'vitest'
import type { SolveCondition } from '../domain'
import { SimulationPlayer } from '../features/simulation/model/SimulationPlayer'
import { SimulationTerminal } from '../features/simulation/model/SimulationTerminal'
import { createSimulationEngine, type WorkerJobs } from '../features/simulation/simulationServices'
import { largeLab, largeLabAddress, largeLabHost } from './largeLab'
import { SimJobs } from './simJobs'

/** One frame at 60 Hz: work above it is a visible hitch. */
const FRAME_MS = 16

function timed<Value>(work: () => Value): { value: Value; ms: number } {
  const start = performance.now()
  const value = work()
  return { value, ms: performance.now() - start }
}

const MAIN_THREAD: WorkerJobs = { usesWorker: () => false, command: (job) => Promise.resolve(new SimJobs().command(job)) }

describe('simulation on a 100-device lab', () => {
  it('creates the player, pings in realtime and verifies within bounds', () => {
    const lab = largeLab()
    expect(lab.devices).toHaveLength(100)
    const created = timed(() => new SimulationPlayer(createSimulationEngine, lab))
    const player = created.value
    const terminal = new SimulationTerminal(player, MAIN_THREAD, () => {})
    const source = largeLabHost(1, 0)
    const target = largeLabAddress(4, 21)

    const firstPing = timed(() => terminal.start(source, `ping ${target}`, 'realtime'))
    const secondPing = timed(() => terminal.start(source, `ping ${target}`, 'realtime'))
    const internet = timed(() => terminal.start(source, 'ping 8.8.8.8', 'realtime'))
    expect(firstPing.value.kind).toBe('done')

    const jobs = new SimJobs()
    const snapshot = player.snapshot()
    const workerJob = timed(() => structuredClone(jobs.command(structuredClone({ snapshot, deviceId: source, line: `ping ${target}` }))))

    const conditions: SolveCondition[] = [
      { type: 'reachable', fromDeviceId: source, toDeviceId: largeLabHost(4, 21) },
      { type: 'internet', fromDeviceId: largeLabHost(2, 1) },
    ]
    const solve = timed(() => jobs.solve(lab, conditions))
    expect(solve.value.map((result) => result.ok)).toEqual([true, true])

    console.info(
      [
        `player create+settle ${created.ms.toFixed(1)} ms`,
        `realtime ping (cold) ${firstPing.ms.toFixed(1)} ms`,
        `realtime ping (warm) ${secondPing.ms.toFixed(1)} ms`,
        `realtime ping 8.8.8.8 ${internet.ms.toFixed(1)} ms`,
        `worker command incl. structured clone ${workerJob.ms.toFixed(1)} ms`,
        `verify 2 conditions ${solve.ms.toFixed(1)} ms`,
      ].join(' | '),
    )
    // A warm realtime ping stays within a few frames even on a slow machine.
    expect(secondPing.ms).toBeLessThan(FRAME_MS * 10)
  })
})
