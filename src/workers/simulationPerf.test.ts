// Timings behind the Web Worker split (docs/SIMULATION.md §5.5, BACKLOG item 6) on 100- and ~200-device labs.
// Bounds are loose (CI machines vary); the printed numbers go into the wave report.
import { describe, expect, it } from 'vitest'
import type { SolveCondition } from '../domain'
import { localBuild } from '../features/simulation/model/simFixtures'
import { SimulationPlayer, type EngineBuild } from '../features/simulation/model/SimulationPlayer'
import { SimulationTerminal } from '../features/simulation/model/SimulationTerminal'
import { simulationRuntime } from '../features/simulation/simulationRuntime'
import type { WorkerJobs } from '../features/simulation/simulationServices'
import { largeLab, largeLabAddress, largeLabHost } from './largeLab'
import { SimJobs } from './simJobs'

/** One frame at 60 Hz: work above it is a visible hitch. */
const FRAME_MS = 16

function timed<Value>(work: () => Value): { value: Value; ms: number } {
  const start = performance.now()
  const value = work()
  return { value, ms: performance.now() - start }
}

const MAIN_THREAD: WorkerJobs = {
  usesWorker: () => false,
  command: (job) => Promise.resolve(new SimJobs().command(job)),
  prepare: (state) => Promise.resolve(new SimJobs().prepare(state)),
}

describe('simulation on a 100-device lab', () => {
  it('creates the player, pings in realtime and verifies within bounds', () => {
    const lab = largeLab()
    expect(lab.devices).toHaveLength(100)
    const created = timed(() => new SimulationPlayer(localBuild(), lab))
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

describe('opening a ~200-device lab', () => {
  it('blocks the main thread only to restore the snapshot the worker settled', async () => {
    const lab = largeLab(8)
    expect(lab.devices).toHaveLength(196)
    // Before: the engine was created and settled on the main thread when the workspace mounted.
    const onMainThread = timed(() => simulationRuntime.createEngine(lab))

    // Now: the worker settles (here: the same job, structured-cloned like a message) ...
    const jobs = new SimJobs()
    const inWorker = timed(() => structuredClone(jobs.prepare(structuredClone(lab))))
    // ... while the main thread only builds the player (no engine yet) and later restores the snapshot.
    let arrive: () => void = () => {}
    const build: EngineBuild = (network) =>
      new Promise((resolve) => {
        arrive = () => resolve({ engine: simulationRuntime.restoreEngine({ ...inWorker.value.snapshot, network }), runtime: simulationRuntime, settleTruncated: false })
      })
    const mounted = timed(() => new SimulationPlayer(build, lab))
    expect(mounted.value.getView().status).toBe('preparing')
    const restored = timed(() => arrive())
    await mounted.value.prepare()
    expect(mounted.value.getView().status).toBe('ready')
    expect(mounted.value.getView().canStepForward).toBe(onMainThread.value.isIdle() === false)

    console.info(
      [
        `196 devices: main-thread create+settle (before) ${onMainThread.ms.toFixed(1)} ms`,
        `worker prepare incl. clones ${inWorker.ms.toFixed(1)} ms`,
        `main thread at mount (now) ${mounted.ms.toFixed(2)} ms`,
        `main thread restore (now) ${restored.ms.toFixed(1)} ms`,
      ].join(' | '),
    )
    expect(mounted.ms).toBeLessThan(FRAME_MS)
  })
})
