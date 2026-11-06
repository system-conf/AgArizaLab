import { describe, expect, it, vi } from 'vitest'
import type { NetworkState } from '../../../domain'
import { hubLab, toyLayers } from '../../../sim/core/kernelTestLayers'
import { SimulationKernel } from '../../../sim'
import { flatTestLab } from '../../../sim/perf/flatTestLab'
import { SimJobs } from '../../../workers/simJobs'
import { simulationRuntime } from '../simulationRuntime'
import { localBuild } from './simFixtures'
import { SimulationPlayer, type EngineBuild, type PlayerEngine } from './SimulationPlayer'
import { StepHistory } from './StepHistory'

const toyBuild = localBuild((network) => SimulationKernel.create(network, toyLayers))
const ping = { kind: 'ping', deviceId: 'pc1', targetIp: '10.0.0.2', count: 1, size: 32 } as const

describe('StepHistory', () => {
  it('forgets the oldest entry beyond its depth', () => {
    const history = new StepHistory<number>(2)
    history.push(1)
    history.push(2)
    history.push(3)
    expect([history.size, history.pop(), history.pop(), history.pop(), history.canPop]).toEqual([2, 3, 2, undefined, false])
  })

  it('rejects a depth below one', () => {
    expect(() => new StepHistory<number>(0)).toThrow()
  })
})

describe('SimulationPlayer', () => {
  it('steps forward one instant at a time and notifies subscribers', () => {
    const player = new SimulationPlayer(toyBuild, hubLab())
    let notified = 0
    player.subscribe(() => (notified += 1))
    expect(player.getView().canStepForward).toBe(false)
    expect(player.stepForward()).toBeNull()

    player.inject(ping)
    expect(player.getView().canStepForward).toBe(true)
    const first = player.stepForward()
    const start = player.getView().time
    expect(first).toMatchObject({ from: start, to: start, animate: true })
    expect(player.getView().events.map((event) => event.action)).toEqual(['created'])
    expect(player.getView().transmissions).toHaveLength(1)

    const second = player.stepForward()
    expect(second).toMatchObject({ from: start, to: start + 1 })
    expect(player.getView().events.map((event) => [event.deviceId, event.action])).toEqual([
      ['pc1', 'created'],
      ['hub', 'flooded'],
    ])
    expect(notified).toBe(3)
  })

  it('steps back to the snapshot before a step, logs and window included', () => {
    const player = new SimulationPlayer(toyBuild, hubLab())
    const start = player.getView().time
    player.inject(ping)
    const first = player.stepForward()
    player.stepForward()
    expect(player.getView().canStepBack).toBe(true)

    expect(player.stepBack()).toBe(true)
    const view = player.getView()
    expect(view.time).toBe(start)
    expect(view.events).toHaveLength(1)
    expect(view.transmissions).toHaveLength(1)
    expect(view.window).toMatchObject({ from: first?.from, to: first?.to, animate: false })
    expect(view.window?.serial).not.toBe(first?.serial)

    expect(player.stepBack()).toBe(true)
    expect(player.getView()).toMatchObject({ events: [], window: null, canStepBack: false, canStepForward: true })
    expect(player.stepBack()).toBe(false)
  })

  it('replays identically after a step back (determinism)', () => {
    const player = new SimulationPlayer(toyBuild, hubLab())
    player.inject(ping)
    player.stepForward()
    player.stepForward()
    const before = player.getView().events
    player.stepBack()
    player.stepForward()
    expect(player.getView().events).toEqual(before)
  })

  it('runs to idle for realtime and resets to a fresh engine', () => {
    const player = new SimulationPlayer(toyBuild, hubLab())
    player.inject(ping)
    player.stepForward()
    player.runToIdle()
    expect(player.getView()).toMatchObject({ canStepForward: false, canStepBack: false, window: null })
    expect(player.getView().events.some((event) => event.action === 'delivered')).toBe(true)

    player.reset()
    expect(player.getView()).toMatchObject({ events: [], transmissions: [], canStepBack: false })
  })

  it('follows lab edits and drops the history that would undo them', () => {
    const lab = hubLab()
    const player = new SimulationPlayer(toyBuild, lab)
    player.inject(ping)
    player.stepForward()
    player.reconfigure(lab)
    expect(player.getView().canStepBack).toBe(true)
    player.reconfigure({ ...lab, devices: lab.devices.filter((device) => device.id !== 'pc3') })
    expect(player.getView().canStepBack).toBe(false)
  })

  it('advances in realtime up to a virtual time', () => {
    const player = new SimulationPlayer(toyBuild, hubLab())
    const start = player.getView().time
    player.inject(ping)
    player.advanceTo(start + 1)
    expect(player.getView().time).toBe(start + 1)
    expect(player.getView().events.map((event) => event.deviceId)).toEqual(['pc1', 'hub'])
  })

  it('exports the wire frames as pcap', () => {
    const player = new SimulationPlayer(toyBuild, hubLab())
    player.inject(ping)
    player.runToIdle()
    const result = player.exportPcap(0)
    expect(result?.packets).toBe(player.getView().transmissions.length)
    expect(result?.packets).toBeGreaterThan(0)
  })
})

/** A build that finishes when the test says so (the Web Worker, code loaded on demand). */
function deferredBuild() {
  const local = toyBuild
  const calls: { network: NetworkState; finish: () => void }[] = []
  const build: EngineBuild = (network) =>
    new Promise<PlayerEngine>((resolve) => {
      calls.push({ network, finish: () => resolve(local(network)) })
    })
  return { build, calls }
}

describe('SimulationPlayer preparation', () => {
  it('stays usable while the engine is built elsewhere and takes it over when it arrives', async () => {
    const { build, calls } = deferredBuild()
    const player = new SimulationPlayer(build, hubLab())
    expect(player.getView()).toMatchObject({ status: 'preparing', canStepForward: false, events: [] })
    expect(player.ready).toBe(false)
    expect(player.inject(ping)).toBeNull()
    expect(player.stepForward()).toBeNull()
    player.advanceTo(1000)
    expect(() => player.snapshot()).toThrow()

    calls[0]?.finish()
    await expect(player.prepare()).resolves.toBe(true)
    expect(player.getView().status).toBe('ready')
    expect(player.inject(ping)).not.toBeNull()
    expect(player.stepForward()).not.toBeNull()
  })

  it('applies lab edits made while the engine was being built', async () => {
    const { build, calls } = deferredBuild()
    const lab = hubLab()
    const player = new SimulationPlayer(build, lab)
    const edited = { ...lab, devices: lab.devices.filter((device) => device.id !== 'pc3') }
    player.reconfigure(edited)
    calls[0]?.finish()
    await player.prepare()
    expect(player.engineNetwork).toBe(edited)
    expect(calls.map((call) => call.network)).toEqual([lab])
  })

  it('builds a very large lab only on demand and drops a build a reset made stale', async () => {
    const { build, calls } = deferredBuild()
    const player = new SimulationPlayer(build, hubLab(), { startNow: false })
    expect(player.getView().status).toBe('dormant')
    expect(calls).toHaveLength(0)

    const first = player.prepare()
    expect(player.prepare()).toBe(first)
    player.reset(hubLab())
    calls[0]?.finish()
    await expect(first).resolves.toBe(false)
    calls[1]?.finish()
    await expect(player.prepare()).resolves.toBe(true)
    expect(calls).toHaveLength(2)
  })

  it('logs a failed build and goes back to dormant, so the next demand tries again', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let attempts = 0
    const build: EngineBuild = (network) => {
      attempts += 1
      return attempts === 1 ? Promise.reject(new Error('worker crashed')) : toyBuild(network)
    }
    const player = new SimulationPlayer(build, hubLab())
    await expect(player.prepare()).resolves.toBe(false)
    expect(player.getView().status).toBe('dormant')
    expect(error).toHaveBeenCalled()
    await expect(player.prepare()).resolves.toBe(true)
    error.mockRestore()
  })
})

describe('SimulationPlayer with an engine settled in the Web Worker', () => {
  it('reports a cut-short start-up from the worker (a restored engine does not know it)', async () => {
    const lab = flatTestLab(40)
    const prepared = structuredClone(new SimJobs({ settleBudget: { tasks: 300 } }).prepare(structuredClone(lab)))
    expect(prepared.settleTruncated).toBe(true)
    const build: EngineBuild = (network) =>
      Promise.resolve({ engine: simulationRuntime.restoreEngine({ ...prepared.snapshot, network }), runtime: simulationRuntime, settleTruncated: prepared.settleTruncated })
    const player = new SimulationPlayer(build, lab)
    await player.prepare()
    // The rest of the start-up traffic is still queued and runs with the first steps.
    expect(player.getView()).toMatchObject({ status: 'ready', settleTruncated: true, canStepForward: true })
    expect(player.engineNetwork).toBe(lab)
  })
})
