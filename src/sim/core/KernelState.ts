import type { NetworkState } from '../../domain'
import type { DeviceRuntime, QueuedTask, RequestRecord, SimCounters, SimSnapshot } from '../contract'
import { SeededRandom } from './SeededRandom'
import { TaskHeap } from './TaskHeap'
import type { ScopeBase, ScopeResult } from './TaskScope'

const EMPTY_NETWORK: NetworkState = { devices: [], links: [] }

/**
 * The kernel's live state. Mutable on purpose: a task changes a few runtimes and queues a few frames,
 * and applying that must not copy the whole lab (docs/SIMULATION.md §5, limits). The immutable
 * `SimSnapshot` is built only when someone asks for it and reused until the state changes again, so
 * `snapshot()` keeps its identity semantics (same object while nothing happened).
 */
export class KernelState implements ScopeBase {
  network: NetworkState
  time: number
  counters: SimCounters
  rngState: number
  private readonly deviceTable: Record<string, DeviceRuntime>
  private readonly requestTable: Record<string, RequestRecord>
  private readonly queue: TaskHeap
  private frozen: SimSnapshot | null

  private constructor(snapshot: SimSnapshot, frozen: SimSnapshot | null) {
    this.network = snapshot.network
    this.time = snapshot.time
    this.counters = snapshot.counters
    this.rngState = snapshot.rngState
    this.deviceTable = { ...snapshot.devices }
    this.requestTable = { ...snapshot.requests }
    this.queue = TaskHeap.fromSorted(snapshot.queue)
    this.frozen = frozen
  }

  static initial(seed: number): KernelState {
    const counters: SimCounters = { seq: 1, event: 1, transmission: 1, pdu: 1, frame: 1, request: 1 }
    return new KernelState({ network: EMPTY_NETWORK, time: 0, counters, rngState: SeededRandom.seed(seed), queue: [], devices: {}, requests: {} }, null)
  }

  /** Continues from `snapshot` (never written to: the state works on copies). */
  static restored(snapshot: SimSnapshot): KernelState {
    return new KernelState(snapshot, snapshot)
  }

  get devices(): Readonly<Record<string, DeviceRuntime>> {
    return this.deviceTable
  }

  get requests(): Readonly<Record<string, RequestRecord>> {
    return this.requestTable
  }

  get queueSize(): number {
    return this.queue.size
  }

  peek(): QueuedTask | undefined {
    return this.queue.peek()
  }

  pop(): QueuedTask | undefined {
    this.frozen = null
    return this.queue.pop()
  }

  /** A new request record and its start task. */
  addRequest(record: RequestRecord, task: QueuedTask): void {
    this.frozen = null
    this.requestTable[record.id] = record
    this.queue.push(task)
  }

  setTime(time: number): void {
    this.frozen = null
    this.time = time
  }

  setNetwork(network: NetworkState): void {
    this.frozen = null
    this.network = network
  }

  setCounters(counters: SimCounters): void {
    this.frozen = null
    this.counters = counters
  }

  /** What a scope committed: touched runtimes and requests, counters, RNG, new tasks. */
  apply(result: ScopeResult): void {
    this.frozen = null
    this.counters = result.counters
    this.rngState = result.rngState
    for (const [deviceId, runtime] of result.devices) {
      if (runtime) this.deviceTable[deviceId] = runtime
      else delete this.deviceTable[deviceId]
    }
    for (const [requestId, record] of result.requests) this.requestTable[requestId] = record
    for (const task of result.tasks) this.queue.push(task)
  }

  snapshot(): SimSnapshot {
    this.frozen ??= {
      network: this.network,
      time: this.time,
      counters: this.counters,
      rngState: this.rngState,
      queue: this.queue.toSorted(),
      devices: { ...this.deviceTable },
      requests: { ...this.requestTable },
    }
    return this.frozen
  }
}
