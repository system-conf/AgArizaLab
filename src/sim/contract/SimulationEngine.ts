// The simulator's public face (docs/SIMULATION.md §5): created from a NetworkState, driven by requests,
// stepped on a virtual clock, snapshotted for step-back, reconfigured when the user edits the lab.
import type { Link, NetworkState } from '../../domain'
import type { FrameArrival } from './Layers'
import type { RequestRecord, SimRequest } from './Requests'
import type { DeviceRuntime, SimTimer } from './Runtime'
import type { SimEvent, SimTransmission } from './SimEvent'

/** Work queued on the virtual clock. Requests and arrivals are always for one device. */
export type SimTask =
  | { readonly kind: 'arrival'; readonly deviceId: string; readonly arrival: FrameArrival; readonly transmissionId: number }
  | { readonly kind: 'timer'; readonly deviceId: string; readonly timer: SimTimer }
  | { readonly kind: 'request'; readonly deviceId: string; readonly requestId: string }

/** Ordered by (time, seq); `seq` is a global counter assigned when the task is queued. */
export interface QueuedTask {
  readonly time: number
  readonly seq: number
  readonly task: SimTask
}

/** Counters of everything the kernel numbers. */
export interface SimCounters {
  readonly seq: number
  readonly event: number
  readonly transmission: number
  readonly pdu: number
  readonly frame: number
  readonly request: number
}

/**
 * Complete, immutable, JSON-serializable state of an engine. Events and transmissions are not inside:
 * they are append-only logs of the engine, and `counters.event` / `counters.transmission` mark where a
 * snapshot's log ends (restore truncates the logs there).
 */
export interface SimSnapshot {
  readonly network: NetworkState
  readonly time: number
  readonly counters: SimCounters
  /** State of the seeded generator (uint32). */
  readonly rngState: number
  readonly queue: readonly QueuedTask[]
  /** Runtime of every powered device, keyed by device id. */
  readonly devices: Readonly<Record<string, DeviceRuntime>>
  readonly requests: Readonly<Record<string, RequestRecord>>
}

/** Virtual time a frame needs on a link (docs/SIMULATION.md §3.4). */
export interface LatencyModel {
  linkDelayMs(link: Link): number
}

export interface SimOptions {
  /** RNG seed; same seed + same inputs = same events. Default 1. */
  readonly seed?: number
  /**
   * Run the start-up traffic (duplicate address probes) to idle inside `create` and clear the logs, so
   * the user starts from a quiet network. Default true.
   */
  readonly settle?: boolean
  readonly latency?: LatencyModel
  /** Oldest events / transmissions are forgotten beyond this many. Default 50 000. */
  readonly maxRetainedEvents?: number
}

/** 'instant': every task at the next point in time (all packets in flight move one hop); 'task': one task. */
export type StepGranularity = 'instant' | 'task'

export interface StepResult {
  /** Clock after the step. */
  readonly time: number
  readonly events: readonly SimEvent[]
  readonly transmissions: readonly SimTransmission[]
  readonly processedTasks: number
  /** Nothing left in the queue. */
  readonly idle: boolean
}

export interface RunResult extends StepResult {
  readonly stoppedBy: 'idle' | 'limit' | 'time' | 'requestDone'
}

export interface ReconfigureReport {
  /** Hooks ran for these (config or link status changed). */
  readonly changedDevices: readonly string[]
  /** Runtime started fresh (added or powered on). */
  readonly startedDevices: readonly string[]
  /** Runtime discarded (removed or powered off). */
  readonly stoppedDevices: readonly string[]
  readonly abortedRequests: readonly string[]
  /** Events the change hooks produced (e.g. duplicate address probes). */
  readonly events: readonly SimEvent[]
}

/**
 * A packet-level discrete-event simulation of one lab. Deterministic: same network, options and calls →
 * same events. Created by `SimulationKernel.create(network, layers, options)` (src/sim/core).
 */
export interface SimulationEngine {
  readonly time: number
  /** Current configuration: the lab's plus the effects the simulation applied (DHCP leases). */
  network(): NetworkState
  runtime(deviceId: string): DeviceRuntime | undefined
  /** Queues a request at `now + delayMs`; returns its id (= flowId of everything it causes). Unknown device = programmer error. */
  inject(request: SimRequest, delayMs?: number): string
  request(requestId: string): RequestRecord | undefined
  requests(): readonly RequestRecord[]
  step(granularity?: StepGranularity): StepResult
  /** Default limit: 100 000 tasks. */
  runUntilIdle(taskLimit?: number): RunResult
  /** Processes tasks up to `time`, then moves the clock to `time` (realtime mode). */
  runUntil(time: number, taskLimit?: number): RunResult
  runUntilDone(requestId: string, taskLimit?: number): RunResult
  isIdle(): boolean
  nextTaskTime(): number | null
  snapshot(): SimSnapshot
  /** Back to an earlier snapshot of this engine (step back); logs are truncated to it. */
  restore(snapshot: SimSnapshot): void
  /** The user edited the lab: diff, reset / start / notify devices (docs/SIMULATION.md §5.3). */
  reconfigure(next: NetworkState): ReconfigureReport
  /** Retained events with `id >= fromId`. */
  events(fromId?: number): readonly SimEvent[]
  transmissions(fromId?: number): readonly SimTransmission[]
}
