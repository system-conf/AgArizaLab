import type { Link, NetworkState } from '../../domain'
import { Topology } from '../../net/Topology'
import type {
  DeviceContext,
  DeviceRuntime,
  LatencyModel,
  PduIds,
  QueuedTask,
  RequestRecord,
  RequestResult,
  SimCounters,
  SimEvent,
  SimLayers,
  SimTask,
  SimTimer,
  SimTransmission,
  StateEffect,
  TransmitTarget,
  WireFrame,
} from '../contract'
import { PduLayers } from '../contract'
import { EventRecorder, type RecorderInit, type TransmitSink } from './EventRecorder'
import { ScopedContext } from './ScopedContext'
import { SeededRandom } from './SeededRandom'

export interface ScopeDependencies {
  readonly layers: SimLayers
  readonly latency: LatencyModel
}

/** The engine state a scope starts from; read only — the scope never writes into it. */
export interface ScopeBase {
  readonly network: NetworkState
  readonly time: number
  readonly counters: SimCounters
  readonly rngState: number
  readonly devices: Readonly<Record<string, DeviceRuntime>>
  readonly requests: Readonly<Record<string, RequestRecord>>
}

/** What one task changed: only the touched runtimes and requests (undefined runtime = stopped). */
export interface ScopeResult {
  readonly counters: SimCounters
  readonly rngState: number
  readonly devices: ReadonlyMap<string, DeviceRuntime | undefined>
  readonly requests: ReadonlyMap<string, RequestRecord>
  readonly tasks: readonly QueuedTask[]
  readonly events: SimEvent[]
  readonly transmissions: SimTransmission[]
  readonly effects: StateEffect[]
}

type Counters = { -readonly [Key in keyof SimCounters]: number }

/**
 * The working copy of the engine state while one task (or one batch of lifecycle hooks) runs at one
 * point in time. Layers change it through DeviceContexts; changes go into small overlays over the base,
 * so a task costs what it touches, not the size of the lab. `commit` hands the changes to the kernel.
 */
export class TaskScope implements TransmitSink {
  readonly time: number
  readonly network: NetworkState
  readonly topology: Topology
  readonly layers: SimLayers
  private readonly base: ScopeBase
  private readonly seq: number
  private readonly latency: LatencyModel
  private readonly counters: Counters
  private rngState: number
  private readonly devices = new Map<string, DeviceRuntime | undefined>()
  private readonly requests = new Map<string, RequestRecord>()
  private readonly tasks: QueuedTask[] = []
  private readonly recorders: EventRecorder[] = []
  private readonly transmissions: SimTransmission[] = []
  private readonly effects: StateEffect[] = []

  /** The task being processed must no longer be queued in the engine (or be popped before the commit is applied). */
  constructor(base: ScopeBase, seq: number, deps: ScopeDependencies) {
    this.base = base
    this.seq = seq
    this.time = base.time
    this.network = base.network
    this.topology = Topology.of(base.network)
    this.layers = deps.layers
    this.latency = deps.latency
    this.counters = { ...base.counters }
    this.rngState = base.rngState
  }

  hasRuntime(deviceId: string): boolean {
    return this.currentRuntime(deviceId) !== undefined
  }

  runtimeOf(deviceId: string): DeviceRuntime {
    const runtime = this.currentRuntime(deviceId)
    if (!runtime) throw new Error(`Device ${deviceId} is not running`)
    return runtime
  }

  setRuntime(deviceId: string, runtime: DeviceRuntime | undefined): void {
    this.devices.set(deviceId, runtime)
  }

  updateRuntime(deviceId: string, change: (runtime: DeviceRuntime) => DeviceRuntime): void {
    this.devices.set(deviceId, change(this.runtimeOf(deviceId)))
  }

  /** Context of a running device; `arrival` = the builder of the task's arriving frame. */
  context(deviceId: string, arrival: EventRecorder | null): DeviceContext {
    this.runtimeOf(deviceId)
    return new ScopedContext(this, this.topology.require(deviceId), arrival)
  }

  openEvent(init: RecorderInit): EventRecorder {
    const recorder = new EventRecorder(this.counters.event, init, this)
    this.counters.event += 1
    this.recorders.push(recorder)
    return recorder
  }

  newPdu(flowId: string): PduIds {
    const pduId = `p${this.counters.pdu}`
    this.counters.pdu += 1
    return { flowId, pduId, frameId: this.newFrameId() }
  }

  newFrameId(): string {
    const frameId = `f${this.counters.frame}`
    this.counters.frame += 1
    return frameId
  }

  random(): number {
    const { value, state } = SeededRandom.next(this.rngState)
    this.rngState = state
    return value
  }

  enqueue(task: SimTask, time: number): void {
    if (!(time >= this.time)) throw new Error(`Task scheduled in the past: ${time} < ${this.time}`)
    this.tasks.push({ time, seq: this.counters.seq, task })
    this.counters.seq += 1
  }

  schedule(deviceId: string, delayMs: number, timer: SimTimer): void {
    if (!(delayMs >= 0)) throw new Error(`Negative timer delay: ${delayMs}`)
    this.enqueue({ kind: 'timer', deviceId, timer }, this.time + delayMs)
  }

  request(requestId: string): RequestRecord | undefined {
    return this.requests.get(requestId) ?? this.base.requests[requestId]
  }

  setRequest(record: RequestRecord): void {
    this.requests.set(record.id, record)
  }

  report(requestId: string, result: RequestResult, done: boolean): void {
    const record = this.request(requestId)
    if (!record) throw new Error(`Unknown request: ${requestId}`)
    if (record.status === 'done') return
    this.requests.set(requestId, { ...record, result, status: done ? 'done' : 'running', finishedAt: done ? this.time : null })
  }

  /** Every unfinished request of the device ends without a final result. */
  abortRequests(deviceId: string, why: NonNullable<RequestRecord['aborted']>): string[] {
    const aborted: string[] = []
    for (const id of Object.keys(this.base.requests)) {
      const record = this.request(id)
      if (!record || record.status === 'done' || record.request.deviceId !== deviceId) continue
      this.requests.set(id, { ...record, status: 'done', finishedAt: this.time, aborted: why })
      aborted.push(id)
    }
    return aborted
  }

  applyEffect(effect: StateEffect): void {
    this.effects.push(effect)
  }

  transmit(recorder: EventRecorder, target: TransmitTarget, frame: WireFrame, frameId: string): boolean {
    const { deviceId } = recorder
    const link = this.linkFor(deviceId, target)
    if (!link || !this.topology.isUp(link)) return false
    const far = this.topology.farEnd(link, deviceId, target.portId)
    const pduId = recorder.pduId
    if (pduId === null) throw new Error(`Event ${recorder.id} has no PDU to transmit`)
    const ids: PduIds = { flowId: recorder.flowId, pduId, frameId }
    const id = this.counters.transmission
    this.counters.transmission += 1
    const arriveAt = this.time + this.latency.linkDelayMs(link)
    this.transmissions.push({
      id,
      eventId: recorder.id,
      linkId: link.id,
      from: { deviceId, portId: target.portId },
      to: far.end,
      departAt: this.time,
      arriveAt,
      ...ids,
      frame,
      protocol: PduLayers.protocolOf(frame),
    })
    const arrival = { portId: far.end.portId, linkId: link.id, fromDeviceId: deviceId, fromPortId: target.portId, frame, ids }
    this.enqueue({ kind: 'arrival', deviceId: far.end.deviceId, arrival, transmissionId: id }, arriveAt)
    return true
  }

  commit(): ScopeResult {
    return {
      counters: { ...this.counters },
      rngState: this.rngState,
      devices: this.devices,
      requests: this.requests,
      tasks: this.tasks,
      events: this.recorders.map((recorder) => recorder.toEvent(this.time, this.seq)),
      transmissions: this.transmissions,
      effects: this.effects,
    }
  }

  private currentRuntime(deviceId: string): DeviceRuntime | undefined {
    return this.devices.has(deviceId) ? this.devices.get(deviceId) : this.base.devices[deviceId]
  }

  /** The link a frame leaves on: the port's only link, or the named one (radio ports hold several). */
  private linkFor(deviceId: string, target: TransmitTarget): Link | undefined {
    const links = this.topology.linksAt(deviceId, target.portId)
    if (target.linkId !== undefined) return links.find((link) => link.id === target.linkId)
    if (links.length > 1) throw new Error(`Port ${deviceId}/${target.portId} holds several links: name one`)
    return links[0]
  }
}
