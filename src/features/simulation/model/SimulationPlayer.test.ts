import { describe, expect, it } from 'vitest'
import { hubLab, toyLayers } from '../../../sim/core/kernelTestLayers'
import { SimulationKernel } from '../../../sim'
import type { EngineFactory } from '../simulationServices'
import { SimulationPlayer } from './SimulationPlayer'
import { StepHistory } from './StepHistory'

const toyFactory: EngineFactory = (network) => SimulationKernel.create(network, toyLayers)
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
    const player = new SimulationPlayer(toyFactory, hubLab())
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
    const player = new SimulationPlayer(toyFactory, hubLab())
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
    const player = new SimulationPlayer(toyFactory, hubLab())
    player.inject(ping)
    player.stepForward()
    player.stepForward()
    const before = player.getView().events
    player.stepBack()
    player.stepForward()
    expect(player.getView().events).toEqual(before)
  })

  it('runs to idle for realtime and resets to a fresh engine', () => {
    const player = new SimulationPlayer(toyFactory, hubLab())
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
    const player = new SimulationPlayer(toyFactory, lab)
    player.inject(ping)
    player.stepForward()
    player.reconfigure(lab)
    expect(player.getView().canStepBack).toBe(true)
    player.reconfigure({ ...lab, devices: lab.devices.filter((device) => device.id !== 'pc3') })
    expect(player.getView().canStepBack).toBe(false)
  })

  it('advances in realtime up to a virtual time', () => {
    const player = new SimulationPlayer(toyFactory, hubLab())
    const start = player.getView().time
    player.inject(ping)
    player.advanceTo(start + 1)
    expect(player.getView().time).toBe(start + 1)
    expect(player.getView().events.map((event) => event.deviceId)).toEqual(['pc1', 'hub'])
  })

  it('exports the wire frames as pcap', () => {
    const player = new SimulationPlayer(toyFactory, hubLab())
    player.inject(ping)
    player.runToIdle()
    const result = player.exportPcap(0)
    expect(result.packets).toBe(player.getView().transmissions.length)
    expect(result.packets).toBeGreaterThan(0)
  })
})
