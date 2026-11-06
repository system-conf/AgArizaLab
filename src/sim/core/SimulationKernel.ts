import type { NetworkState } from '../../domain'
import {
  type DeviceRuntime,
  type QueuedTask,
  type ReconfigureReport,
  type RequestRecord,
  type RunResult,
  SIM_LIMITS,
  type SimEvent,
  type SimLayers,
  type SimOptions,
  type SimRequest,
  type SimSnapshot,
  type SimTask,
  type SimTransmission,
  type SimulationEngine,
  type StateEffect,
  type StepGranularity,
  type StepResult,
} from '../contract'
import { DefaultLatencyModel } from './DefaultLatencyModel'
import { DeviceChanges } from './DeviceChanges'
import { RuntimeTables } from './RuntimeTables'
import { SeededRandom } from './SeededRandom'
import { type ScopeDependencies, TaskScope } from './TaskScope'
import { TaskQueue } from './TaskQueue'

/** Events and transmissions produced while a call runs. */
class Produced {
  readonly events: SimEvent[] = []
  readonly transmissions: SimTransmission[] = []
  tasks = 0

  add(events: readonly SimEvent[], transmissions: readonly SimTransmission[]): void {
    this.events.push(...events)
    this.transmissions.push(...transmissions)
  }
}

const EMPTY_NETWORK: NetworkState = { devices: [], links: [] }

/**
 * The engine shell (docs/SIMULATION.md §5, §6): virtual clock, event queue, seeded RNG, request
 * records, logs, reconfiguration and dispatch of every task to the layer that owns it. It knows no
 * protocol; the layers (S1–S3) do all the networking.
 */
export class SimulationKernel implements SimulationEngine {
  private state: SimSnapshot
  private eventLog: SimEvent[] = []
  private transmissionLog: SimTransmission[] = []
  private readonly deps: ScopeDependencies
  private readonly maxRetained: number

  private constructor(layers: SimLayers, options: SimOptions) {
    this.deps = { layers, latency: options.latency ?? new DefaultLatencyModel() }
    this.maxRetained = options.maxRetainedEvents ?? SIM_LIMITS.maxRetainedEvents
    this.state = {
      network: EMPTY_NETWORK,
      time: 0,
      counters: { seq: 1, event: 1, transmission: 1, pdu: 1, frame: 1, request: 1 },
      rngState: SeededRandom.seed(options.seed ?? 1),
      queue: [],
      devices: {},
      requests: {},
    }
  }

  /** Starts every powered device of `network`; with `settle` (default) runs the start-up traffic and clears the logs. */
  static create(network: NetworkState, layers: SimLayers, options: SimOptions = {}): SimulationKernel {
    const kernel = new SimulationKernel(layers, options)
    kernel.reconfigure(network)
    if (options.settle ?? true) {
      kernel.runUntilIdle()
      kernel.eventLog = []
      kernel.transmissionLog = []
    }
    return kernel
  }

  get time(): number {
    return this.state.time
  }

  network(): NetworkState {
    return this.state.network
  }

  runtime(deviceId: string): DeviceRuntime | undefined {
    return this.state.devices[deviceId]
  }

  request(requestId: string): RequestRecord | undefined {
    return this.state.requests[requestId]
  }

  requests(): readonly RequestRecord[] {
    return Object.values(this.state.requests)
  }

  isIdle(): boolean {
    return this.state.queue.length === 0
  }

  nextTaskTime(): number | null {
    return TaskQueue.peek(this.state.queue)?.time ?? null
  }

  snapshot(): SimSnapshot {
    return this.state
  }

  restore(snapshot: SimSnapshot): void {
    this.state = snapshot
    this.eventLog = this.eventLog.filter((event) => event.id < snapshot.counters.event)
    this.transmissionLog = this.transmissionLog.filter((transmission) => transmission.id < snapshot.counters.transmission)
  }

  events(fromId = 0): readonly SimEvent[] {
    return this.eventLog.filter((event) => event.id >= fromId)
  }

  transmissions(fromId = 0): readonly SimTransmission[] {
    return this.transmissionLog.filter((transmission) => transmission.id >= fromId)
  }

  inject(request: SimRequest, delayMs = 0): string {
    if (!this.state.network.devices.some((device) => device.id === request.deviceId)) {
      throw new Error(`Unknown device id: ${request.deviceId}`)
    }
    if (!(delayMs >= 0)) throw new Error(`Negative request delay: ${delayMs}`)
    const { counters, time } = this.state
    const id = `r${counters.request}`
    const record: RequestRecord = { id, request, status: 'queued', queuedAt: time, finishedAt: null, result: null }
    const task: QueuedTask = { time: time + delayMs, seq: counters.seq, task: { kind: 'request', deviceId: request.deviceId, requestId: id } }
    this.state = {
      ...this.state,
      counters: { ...counters, request: counters.request + 1, seq: counters.seq + 1 },
      queue: TaskQueue.insert(this.state.queue, task),
      requests: { ...this.state.requests, [id]: record },
    }
    return id
  }

  step(granularity: StepGranularity = 'instant'): StepResult {
    const produced = new Produced()
    const head = TaskQueue.peek(this.state.queue)
    if (head) {
      if (granularity === 'task') this.processNext(produced)
      else this.runWhile(produced, SIM_LIMITS.taskLimit, (next) => next.time === head.time)
    }
    return this.result(produced)
  }

  runUntilIdle(taskLimit: number = SIM_LIMITS.taskLimit): RunResult {
    const produced = new Produced()
    this.runWhile(produced, taskLimit, () => true)
    return { ...this.result(produced), stoppedBy: this.isIdle() ? 'idle' : 'limit' }
  }

  runUntil(time: number, taskLimit: number = SIM_LIMITS.taskLimit): RunResult {
    const produced = new Produced()
    this.runWhile(produced, taskLimit, (next) => next.time <= time)
    const limited = produced.tasks >= taskLimit && (this.nextTaskTime() ?? Infinity) <= time
    if (!limited && time > this.state.time) this.state = { ...this.state, time }
    return { ...this.result(produced), stoppedBy: limited ? 'limit' : 'time' }
  }

  runUntilDone(requestId: string, taskLimit: number = SIM_LIMITS.taskLimit): RunResult {
    if (!this.state.requests[requestId]) throw new Error(`Unknown request: ${requestId}`)
    const produced = new Produced()
    const done = () => this.state.requests[requestId]?.status === 'done'
    this.runWhile(produced, taskLimit, () => !done())
    const stoppedBy = done() ? 'requestDone' : this.isIdle() ? 'idle' : 'limit'
    return { ...this.result(produced), stoppedBy }
  }

  reconfigure(next: NetworkState): ReconfigureReport {
    return this.changeNetwork(next, new Produced())
  }

  // ------------------------------------------------------------ internals

  private result(produced: Produced): StepResult {
    return {
      time: this.state.time,
      events: produced.events,
      transmissions: produced.transmissions,
      processedTasks: produced.tasks,
      idle: this.isIdle(),
    }
  }

  private runWhile(produced: Produced, taskLimit: number, accept: (next: QueuedTask) => boolean): void {
    for (let next = TaskQueue.peek(this.state.queue); next && produced.tasks < taskLimit && accept(next); next = TaskQueue.peek(this.state.queue)) {
      this.processNext(produced)
    }
  }

  private processNext(produced: Produced): void {
    const popped = TaskQueue.pop(this.state.queue)
    if (!popped) return
    const { task: queued, rest } = popped
    const scope = new TaskScope({ ...this.state, time: queued.time, queue: rest }, queued.seq, this.deps)
    this.dispatch(scope, queued.task)
    const committed = scope.commit()
    this.state = committed.snapshot
    this.record(produced, committed.events, committed.transmissions)
    produced.tasks += 1
    if (committed.effects.length > 0) this.applyEffects(committed.effects, produced)
  }

  private dispatch(scope: TaskScope, task: SimTask): void {
    switch (task.kind) {
      case 'arrival':
        return this.arrive(scope, task)
      case 'timer': {
        if (!scope.hasRuntime(task.deviceId)) return
        const ctx = scope.context(task.deviceId, null)
        const { layers } = this.deps
        const { timer } = task
        if (timer.layer === 'link') layers.link.onTimer(ctx, timer)
        else if (timer.layer === 'network') layers.network.onTimer(ctx, timer)
        else layers.services.onTimer(ctx, timer)
        return
      }
      case 'request':
        return this.startRequest(scope, task.deviceId, task.requestId)
    }
  }

  /** The frame enters the device unless its link went down while it travelled. */
  private arrive(scope: TaskScope, task: Extract<SimTask, { kind: 'arrival' }>): void {
    const { arrival, deviceId } = task
    const recorder = scope.openEvent({
      deviceId,
      flowId: arrival.ids.flowId,
      pduId: arrival.ids.pduId,
      frameId: arrival.ids.frameId,
      inPortId: arrival.portId,
      inbound: arrival.frame,
      lastDeviceId: arrival.fromDeviceId,
    })
    const link = scope.network.links.find((candidate) => candidate.id === arrival.linkId)
    const joins = link !== undefined && [link.a, link.b].some((end) => end.deviceId === deviceId && end.portId === arrival.portId)
    if (!link || !joins || !scope.topology.isUp(link) || !scope.hasRuntime(deviceId)) {
      recorder.conclude('dropped', 1, 'linkDown')
      return
    }
    this.deps.layers.link.onFrame(scope.context(deviceId, recorder), arrival)
  }

  private startRequest(scope: TaskScope, deviceId: string, requestId: string): void {
    const record = scope.request(requestId)
    if (!record || record.status === 'done') return
    if (!scope.hasRuntime(deviceId)) {
      scope.setRequest({ ...record, status: 'done', finishedAt: scope.time, aborted: 'deviceOff' })
      return
    }
    scope.setRequest({ ...record, status: 'running' })
    const ctx = scope.context(deviceId, null)
    const { request } = record
    const { layers } = this.deps
    switch (request.kind) {
      case 'ping':
      case 'tracert':
        return layers.network.onRequest(ctx, requestId, request)
      case 'clearTable':
        if (request.table !== 'dnsCache') return layers.link.onRequest(ctx, requestId, request)
        return layers.services.onRequest(ctx, requestId, request)
      default:
        return layers.services.onRequest(ctx, requestId, request)
    }
  }

  private applyEffects(effects: readonly StateEffect[], produced: Produced): void {
    let network = this.state.network
    for (const effect of effects) network = this.deps.layers.services.applyEffect(network, effect)
    this.changeNetwork(network, produced)
  }

  /** New configuration: stop, start and notify devices in one scope at the current time. */
  private changeNetwork(next: NetworkState, produced: Produced): ReconfigureReport {
    const plan = DeviceChanges.between(this.state.network, next)
    const { counters } = this.state
    const scope = new TaskScope({ ...this.state, network: next, counters: { ...counters, seq: counters.seq + 1 } }, counters.seq, this.deps)
    const abortedRequests: string[] = []
    for (const { deviceId, removed } of plan.stopped) {
      scope.setRuntime(deviceId, undefined)
      abortedRequests.push(...scope.abortRequests(deviceId, removed ? 'deviceRemoved' : 'deviceOff'))
    }
    const { layers } = this.deps
    for (const deviceId of plan.started) {
      scope.setRuntime(deviceId, RuntimeTables.empty(deviceId))
      const ctx = scope.context(deviceId, null)
      layers.link.onStart(ctx)
      layers.network.onStart(ctx)
      layers.services.onStart(ctx)
    }
    for (const { deviceId, change } of plan.changed) {
      const ctx = scope.context(deviceId, null)
      layers.link.onChange(ctx, change)
      layers.network.onChange(ctx, change)
      layers.services.onChange(ctx, change)
    }
    const committed = scope.commit()
    this.state = committed.snapshot
    this.record(produced, committed.events, committed.transmissions)
    if (committed.effects.length > 0) this.applyEffects(committed.effects, produced)
    return {
      changedDevices: plan.changed.map((entry) => entry.deviceId),
      startedDevices: [...plan.started],
      stoppedDevices: plan.stopped.map((entry) => entry.deviceId),
      abortedRequests,
      events: committed.events,
    }
  }

  private record(produced: Produced, events: readonly SimEvent[], transmissions: readonly SimTransmission[]): void {
    produced.add(events, transmissions)
    this.eventLog.push(...events)
    this.transmissionLog.push(...transmissions)
    if (this.eventLog.length > this.maxRetained) this.eventLog.splice(0, this.eventLog.length - this.maxRetained)
    if (this.transmissionLog.length > this.maxRetained) {
      this.transmissionLog.splice(0, this.transmissionLog.length - this.maxRetained)
    }
  }
}
