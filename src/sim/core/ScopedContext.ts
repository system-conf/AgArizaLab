import type { Device, NetworkState } from '../../domain'
import type { Topology } from '../../engine/Topology'
import type {
  DeviceContext,
  DeviceRuntime,
  EventBuilder,
  EventDraft,
  PduIds,
  RequestResult,
  SimLayers,
  SimTimer,
  StateEffect,
} from '../contract'
import type { EventRecorder } from './EventRecorder'
import type { TaskScope } from './TaskScope'

/** DeviceContext of one device inside a TaskScope (docs/SIMULATION.md §6.1). */
export class ScopedContext implements DeviceContext {
  readonly device: Device
  readonly arrival: EventBuilder | null
  private readonly scope: TaskScope

  constructor(scope: TaskScope, device: Device, arrival: EventRecorder | null) {
    this.scope = scope
    this.device = device
    this.arrival = arrival
  }

  get now(): number {
    return this.scope.time
  }

  get network(): NetworkState {
    return this.scope.network
  }

  get topology(): Topology {
    return this.scope.topology
  }

  get runtime(): DeviceRuntime {
    return this.scope.runtimeOf(this.device.id)
  }

  get layers(): SimLayers {
    return this.scope.layers
  }

  updateRuntime(change: (runtime: DeviceRuntime) => DeviceRuntime): void {
    this.scope.updateRuntime(this.device.id, change)
  }

  random(): number {
    return this.scope.random()
  }

  openEvent(draft: EventDraft): EventBuilder {
    return this.scope.openEvent({
      deviceId: this.device.id,
      flowId: draft.flowId,
      pduId: draft.ids?.pduId ?? null,
      frameId: draft.ids?.frameId ?? null,
      ...(draft.protocol === undefined ? {} : { protocol: draft.protocol }),
      ...(draft.causeEventId === undefined ? {} : { causeEventId: draft.causeEventId }),
    })
  }

  newPdu(flowId: string): PduIds {
    return this.scope.newPdu(flowId)
  }

  newFrameId(): string {
    return this.scope.newFrameId()
  }

  schedule(delayMs: number, timer: SimTimer): void {
    this.scope.schedule(this.device.id, delayMs, timer)
  }

  report(requestId: string, result: RequestResult, done: boolean): void {
    this.scope.report(requestId, result, done)
  }

  applyEffect(effect: StateEffect): void {
    this.scope.applyEffect(effect)
  }
}
