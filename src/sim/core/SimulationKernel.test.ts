import { describe, expect, it } from 'vitest'
import { editDevice, editLink } from '../../engine/testLabs'
import type { LinkLayer, SimLayers } from '../contract'
import { hubLab, toyLayers } from './kernelTestLayers'
import { SimulationKernel } from './SimulationKernel'

const ping = { kind: 'ping', deviceId: 'pc1', targetIp: '10.0.0.2', count: 1, size: 32 } as const

function created(layers: SimLayers = toyLayers) {
  return SimulationKernel.create(hubLab(), layers)
}

describe('SimulationKernel', () => {
  it('starts every powered device and settles the start-up traffic out of the logs', () => {
    const kernel = created()
    expect(kernel.events()).toEqual([])
    expect(kernel.isIdle()).toBe(true)
    expect(kernel.time).toBe(2)
    expect(['pc1', 'pc2', 'pc3', 'hub'].map((id) => kernel.runtime(id)?.deviceId)).toEqual(['pc1', 'pc2', 'pc3', 'hub'])
  })

  it('keeps the start-up events without settle', () => {
    const kernel = SimulationKernel.create(hubLab(), toyLayers, { settle: false })
    expect(kernel.events().map((event) => [event.deviceId, event.action, event.flowId])).toEqual([
      ['pc1', 'created', 'boot'],
      ['pc2', 'created', 'boot'],
      ['pc3', 'created', 'boot'],
    ])
  })

  it('runs a request until its client reports it done; every PDU it causes carries its id as flow id', () => {
    const kernel = created()
    const id = kernel.inject(ping)
    expect(kernel.request(id)?.status).toBe('queued')
    const run = kernel.runUntilDone(id)
    expect(run.stoppedBy).toBe('requestDone')
    expect(kernel.request(id)).toMatchObject({ status: 'done', finishedAt: 6, result: { kind: 'ping', echoes: [{ kind: 'reply', fromIp: '10.0.0.2' }] } })
    expect(run.events.map((event) => [event.time, event.deviceId, event.action])).toEqual([
      [2, 'pc1', 'created'],
      [3, 'hub', 'flooded'],
      [4, 'pc2', 'replied'],
      [4, 'pc2', 'created'],
      [4, 'pc3', 'dropped'],
      [5, 'hub', 'flooded'],
      [6, 'pc1', 'delivered'],
    ])
    expect(kernel.step().events.map((event) => [event.deviceId, event.action])).toEqual([['pc3', 'dropped']])
    expect(new Set(run.events.map((event) => event.flowId))).toEqual(new Set([id]))
    const reply = run.events[3]
    expect(reply?.causeEventId).toBe(run.events[2]?.id)
    expect(run.events[1]).toMatchObject({ lastDeviceId: 'pc1', inPortId: 'p1', outPortIds: ['p2', 'p3'], protocol: 'arp', layer: 1 })
    expect(run.transmissions.every((transmission) => transmission.arriveAt === transmission.departAt + 1)).toBe(true)
  })

  it('steps one instant at a time: every packet in flight moves one hop', () => {
    const kernel = created()
    kernel.inject(ping)
    expect(kernel.step().events.map((event) => event.deviceId)).toEqual(['pc1'])
    expect(kernel.step().events.map((event) => event.deviceId)).toEqual(['hub'])
    expect(kernel.step().events.map((event) => event.deviceId)).toEqual(['pc2', 'pc2', 'pc3'])
    expect(kernel.step('task').events.map((event) => event.deviceId)).toEqual(['hub'])
  })

  it('is deterministic and replays the same events after a restore', () => {
    const lab = hubLab()
    const first = SimulationKernel.create(lab, toyLayers, { seed: 7 })
    const second = SimulationKernel.create(lab, toyLayers, { seed: 7 })
    first.inject(ping)
    second.inject(ping)
    expect(JSON.stringify(first.runUntilIdle().events)).toBe(JSON.stringify(second.runUntilIdle().events))

    const kernel = created()
    kernel.inject(ping)
    kernel.step()
    const mark = kernel.snapshot()
    const before = kernel.events().length
    const original = kernel.runUntilIdle()
    kernel.restore(mark)
    expect(kernel.events()).toHaveLength(before)
    expect(kernel.time).toBe(mark.time)
    expect(JSON.stringify(kernel.runUntilIdle().events)).toBe(JSON.stringify(original.events))
  })

  it('ignores reports after a request is done and fires timers on the virtual clock', () => {
    const kernel = created()
    const id = kernel.inject(ping)
    kernel.runUntilIdle()
    expect(kernel.time).toBe(4002)
    expect(kernel.events().at(-1)).toMatchObject({ deviceId: 'pc1', action: 'timedOut', reason: 'requestTimedOut', pduId: null, protocol: 'icmp' })
    expect(kernel.request(id)?.result).toMatchObject({ echoes: [{ kind: 'reply' }] })
  })

  it('drops a frame whose link went down while it travelled, and tells both ends', () => {
    const kernel = created()
    kernel.inject(ping)
    kernel.step()
    kernel.step()
    const report = kernel.reconfigure(editLink(kernel.network(), 'l2', (link) => ({ ...link, connected: false })))
    expect(report.changedDevices).toEqual(['pc2', 'hub'])
    expect(kernel.step().events.map((event) => [event.deviceId, event.action, event.reason])).toEqual([
      ['pc2', 'dropped', 'linkDown'],
      ['pc3', 'dropped', 'notForThisInterface'],
    ])
  })

  it('discards the runtime of a device that is switched off and aborts its requests', () => {
    const kernel = created()
    const id = kernel.inject(ping)
    kernel.step()
    const report = kernel.reconfigure(editDevice(kernel.network(), 'pc1', (device) => ({ ...device, powered: false })))
    expect(report).toMatchObject({ stoppedDevices: ['pc1'], abortedRequests: [id] })
    expect(kernel.runtime('pc1')).toBeUndefined()
    expect(kernel.request(id)).toMatchObject({ status: 'done', aborted: 'deviceOff' })
    const back = kernel.reconfigure(editDevice(kernel.network(), 'pc1', (device) => ({ ...device, powered: true })))
    expect(back.startedDevices).toEqual(['pc1'])
    expect(back.events.map((event) => [event.deviceId, event.flowId])).toEqual([['pc1', 'boot']])
  })

  it('applies configuration effects after the task and runs the change hooks', () => {
    const kernel = created()
    const id = kernel.inject({ kind: 'dhcpRelease', deviceId: 'pc2' })
    kernel.runUntilDone(id)
    const nic = kernel.network().devices.find((device) => device.id === 'pc2')?.ports[0]
    expect(nic?.role === 'host' && nic.l3.ipv4.address).toBe('')
    expect(kernel.request(id)?.result).toMatchObject({ kind: 'dhcp', effects: [{ kind: 'dhcpLeaseReleased', clientId: 'pc2' }] })
    expect(kernel.runtime('pc2')?.link.claims).toEqual([{ interfaceId: 'eth0', address: '', duplicate: true, probedAt: kernel.time }])
    expect(kernel.runtime('pc1')?.link.claims).toEqual([])
  })

  it('moves the clock in realtime mode even when nothing happens', () => {
    const kernel = created()
    expect(kernel.runUntil(1000)).toMatchObject({ stoppedBy: 'time', processedTasks: 0 })
    expect(kernel.time).toBe(1000)
    const id = kernel.inject(ping, 50)
    expect(kernel.nextTaskTime()).toBe(1050)
    expect(kernel.request(id)?.queuedAt).toBe(1000)
  })

  it('refuses programmer errors', () => {
    const kernel = created()
    expect(() => kernel.inject({ ...ping, deviceId: 'nobody' })).toThrow('Unknown device id')
    const forgetful: LinkLayer = { ...toyLayers.link, onFrame: () => undefined, onStart: toyLayers.link.onStart.bind(toyLayers.link) }
    expect(() => SimulationKernel.create(hubLab(), { ...toyLayers, link: forgetful })).toThrow('never concluded')
  })

  it('stamps arrival events with the transmission that brought the frame', () => {
    const kernel = created()
    kernel.runUntilDone(kernel.inject(ping))
    const transmissions = kernel.transmissions()
    const arrivals = kernel.events().filter((event) => event.inPortId !== undefined)
    expect(arrivals.length).toBeGreaterThan(0)
    for (const arrival of arrivals) {
      const transmission = transmissions.find((candidate) => candidate.id === arrival.transmissionId)
      expect(transmission?.to).toEqual({ deviceId: arrival.deviceId, portId: arrival.inPortId })
      expect(transmission?.frameId).toBe(arrival.frameId)
    }
    expect(kernel.events().filter((event) => event.inPortId === undefined).every((event) => event.transmissionId === undefined)).toBe(true)
  })

  it('lets the link layer forget start-up learning after settle (onSettled), once per running device', () => {
    const settled: string[] = []
    const link: LinkLayer = Object.assign(Object.create(toyLayers.link) as LinkLayer, {
      onSettled: (ctx: Parameters<NonNullable<LinkLayer['onSettled']>>[0]) => {
        settled.push(`${ctx.device.id}@${ctx.now}`)
      },
    })
    const off = editDevice(hubLab(), 'pc3', (device) => ({ ...device, powered: false }))
    SimulationKernel.create(off, { ...toyLayers, link })
    expect(settled).toEqual(['pc1@2', 'pc2@2', 'hub@2'])
    settled.length = 0
    SimulationKernel.create(off, { ...toyLayers, link }, { settle: false })
    expect(settled).toEqual([])
  })

  it('builds snapshots on demand: the same object while nothing changes, never touched by later tasks', () => {
    const kernel = created()
    const before = kernel.snapshot()
    expect(kernel.snapshot()).toBe(before)
    const frozen = JSON.stringify(before)
    kernel.inject(ping)
    const queued = kernel.snapshot()
    expect(queued).not.toBe(before)
    expect(queued.queue).toHaveLength(1)
    kernel.runUntilIdle()
    expect(JSON.stringify(before)).toBe(frozen)
    expect(queued.queue).toHaveLength(1)
    kernel.restore(queued)
    expect(kernel.snapshot()).toBe(queued)
    expect(kernel.isIdle()).toBe(false)
    kernel.runUntilIdle()
    expect(queued.queue).toHaveLength(1)
  })

  it('leaves the state untouched when a layer throws in the middle of a task', () => {
    const failing: LinkLayer = Object.assign(Object.create(toyLayers.link) as LinkLayer, {
      onFrame: () => {
        throw new Error('layer bug')
      },
    })
    const kernel = SimulationKernel.create(hubLab(), { ...toyLayers, link: failing }, { settle: false })
    for (;;) {
      const mark = kernel.snapshot()
      const marked = JSON.stringify(mark)
      try {
        kernel.step('task')
      } catch (error) {
        expect(String(error)).toContain('layer bug')
        expect(JSON.stringify(kernel.snapshot())).toBe(marked)
        expect(kernel.events()).toHaveLength(mark.counters.event - 1)
        return
      }
      if (kernel.isIdle()) throw new Error('no task reached the failing layer')
    }
  })
})
