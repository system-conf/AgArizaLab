import { describe, expect, it } from 'vitest'
import { editDevice, editLink, labHost, labLink } from '../../engine/testLabs'
import type { NetworkState } from '../../domain'
import type { QueuedTask } from '../contract'
import { DeviceChanges } from './DeviceChanges'
import { RetainedLog } from './RetainedLog'
import { RuntimeTables } from './RuntimeTables'
import { SeededRandom } from './SeededRandom'
import { TaskHeap } from './TaskHeap'
import { TaskQueue } from './TaskQueue'

function task(time: number, seq: number): QueuedTask {
  return { time, seq, task: { kind: 'request', deviceId: 'pc', requestId: `r${seq}` } }
}

describe('TaskQueue', () => {
  it('orders by time, then by sequence number, without touching its input', () => {
    const queue: readonly QueuedTask[] = [task(1, 1), task(5, 2)]
    const next = TaskQueue.insert(TaskQueue.insert(queue, task(5, 4)), task(1, 3))
    expect(next.map((item) => [item.time, item.seq])).toEqual([[1, 1], [1, 3], [5, 2], [5, 4]])
    expect(queue).toHaveLength(2)
    expect(TaskQueue.insertAll([task(2, 9)], [task(0, 10), task(2, 1)]).map((item) => item.seq)).toEqual([10, 1, 9])
    expect(TaskQueue.pop(next)?.task.seq).toBe(1)
    expect(TaskQueue.pop([])).toBeNull()
  })
})

describe('TaskHeap', () => {
  it('pops in (time, seq) order, the same total order as the sorted snapshot queue', () => {
    const random = { state: SeededRandom.seed(5) }
    const tasks = Array.from({ length: 200 }, (_, seq) => {
      const next = SeededRandom.next(random.state)
      random.state = next.state
      return task(Math.floor(next.value * 20), seq)
    })
    const heap = TaskHeap.fromSorted([...tasks.slice(0, 50)].sort(TaskQueue.compare))
    for (const item of tasks.slice(50)) heap.push(item)
    const sorted = [...tasks].sort(TaskQueue.compare)
    expect(heap.toSorted()).toEqual(sorted)
    expect(heap.size).toBe(200)
    const popped: QueuedTask[] = []
    for (let item = heap.pop(); item; item = heap.pop()) popped.push(item)
    expect(popped).toEqual(sorted)
    expect(heap.peek()).toBeUndefined()
  })
})

describe('RetainedLog', () => {
  const entries = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => ({ id: from + index }))

  it('shows the newest `limit` records, by id, and truncates for a restore', () => {
    const log = new RetainedLog<{ id: number }>(4)
    log.append(entries(1, 3))
    expect(log.from(0)).toEqual(entries(1, 3))
    log.append(entries(4, 9))
    expect(log.from(0)).toEqual(entries(6, 9))
    expect(log.from(8)).toEqual(entries(8, 9))
    expect(log.from(10)).toEqual([])
    log.truncate(8)
    expect(log.from(0)).toEqual(entries(6, 7))
    log.clear()
    expect(log.from(0)).toEqual([])
  })

  it('trims in batches: a long run appends in amortized constant time', () => {
    const log = new RetainedLog<{ id: number }>(1000)
    for (let id = 1; id <= 100_000; id += 1) log.append([{ id }])
    expect(log.from(0)).toHaveLength(1000)
    expect(log.from(0)[0]?.id).toBe(99_001)
  })
})

describe('SeededRandom', () => {
  it('repeats the same numbers for the same state and stays in [0, 1)', () => {
    const values = (seed: number) => {
      let state = SeededRandom.seed(seed)
      return Array.from({ length: 50 }, () => {
        const next = SeededRandom.next(state)
        state = next.state
        return next.value
      })
    }
    expect(values(42)).toEqual(values(42))
    expect(values(42)).not.toEqual(values(43))
    expect(values(42).every((value) => value >= 0 && value < 1)).toBe(true)
  })
})

describe('RuntimeTables', () => {
  it('ages entries lazily on the virtual clock', () => {
    const runtime = RuntimeTables.empty('sw')
    const aged = {
      ...runtime,
      link: {
        ...runtime.link,
        macTable: [
          { vlan: 1, mac: '02:00:00:00:00:01', portId: 'Fa0/1', type: 'dynamic' as const, learnedAt: 0, expiresAt: 300_000 },
          { vlan: 1, mac: '02:00:00:00:00:02', portId: 'Fa0/2', type: 'static' as const, learnedAt: 0, expiresAt: null },
        ],
      },
    }
    expect(RuntimeTables.macTable(aged, 299_999)).toHaveLength(2)
    expect(RuntimeTables.macTable(aged, 300_000).map((entry) => entry.portId)).toEqual(['Fa0/2'])
  })
})

describe('DeviceChanges', () => {
  const lab = (): NetworkState => ({
    devices: [labHost('a', '10.0.0.1'), labHost('b', '10.0.0.2')],
    links: [labLink('ab', ['a', 'eth0'], ['b', 'eth0'], { cable: 'copperCross' })],
  })

  it('starts everything from an empty network', () => {
    expect(DeviceChanges.between({ devices: [], links: [] }, lab())).toEqual({ started: ['a', 'b'], stopped: [], changed: [] })
  })

  it('stops removed and switched-off devices and tells the far end its port went down', () => {
    const before = lab()
    const off = editDevice(before, 'b', (device) => ({ ...device, powered: false }))
    const plan = DeviceChanges.between(before, off)
    expect(plan.stopped).toEqual([{ deviceId: 'b', removed: false }])
    expect(plan.changed).toEqual([{ deviceId: 'a', change: { previous: before.devices[0], configChanged: false, portsDown: ['eth0'], portsUp: [] } }])
    expect(DeviceChanges.between(before, { ...before, devices: [before.devices[0] ?? labHost('x', '')] }).stopped).toEqual([{ deviceId: 'b', removed: true }])
  })

  it('reports configuration changes, and ignores equal copies', () => {
    const before = lab()
    const copy = { ...before, devices: before.devices.map((device) => ({ ...device })) }
    expect(DeviceChanges.between(before, copy).changed).toEqual([])
    const renamed = editDevice(before, 'a', (device) => ({ ...device, name: 'A' }))
    expect(DeviceChanges.between(before, renamed).changed.map((entry) => [entry.deviceId, entry.change.configChanged])).toEqual([['a', true]])
    const unplugged = editLink(before, 'ab', (link) => ({ ...link, connected: false }))
    const replugged = DeviceChanges.between(unplugged, before)
    expect(replugged.changed.map((entry) => [entry.deviceId, entry.change.portsUp])).toEqual([['a', ['eth0']], ['b', ['eth0']]])
  })
})
