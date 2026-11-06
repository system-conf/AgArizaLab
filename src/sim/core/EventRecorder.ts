import type { LocalizedMessage } from '../../domain/Messages'
import { localizedMessage } from '../../i18n/messageKeys'
import {
  type EventBuilder,
  type NoteDirection,
  type OsiLayer,
  type Pdu,
  PduLayers,
  type ReasonedAction,
  type SimAction,
  type SimEvent,
  type SimNote,
  type SimProtocol,
  type SimReason,
  type TransmitTarget,
  type WireFrame,
} from '../contract'

/** Start values of a recorded event. */
export interface RecorderInit {
  readonly deviceId: string
  readonly flowId: string
  readonly pduId: string | null
  readonly frameId: string | null
  readonly protocol?: SimProtocol
  readonly inPortId?: string
  readonly inbound?: Pdu
  readonly lastDeviceId?: string
  readonly causeEventId?: number
}

/** Puts frames on links for a recorder (implemented by TaskScope). */
export interface TransmitSink {
  transmit(recorder: EventRecorder, target: TransmitTarget, frame: WireFrame, frameId: string): boolean
}

const REASONED: ReadonlySet<SimAction> = new Set<ReasonedAction>(['dropped', 'timedOut'])

/** The kernel's EventBuilder: collects one event while a task runs, then becomes a SimEvent. */
export class EventRecorder implements EventBuilder {
  readonly id: number
  private readonly init: RecorderInit
  private readonly sink: TransmitSink
  private readonly notes: SimNote[] = []
  private readonly outPortIds: string[] = []
  private outbound: Pdu | null = null
  private decision: { action: SimAction; layer: OsiLayer; reason?: SimReason } | null = null

  constructor(id: number, init: RecorderInit, sink: TransmitSink) {
    this.id = id
    this.init = init
    this.sink = sink
  }

  get deviceId(): string {
    return this.init.deviceId
  }

  get flowId(): string {
    return this.init.flowId
  }

  get pduId(): string | null {
    return this.init.pduId
  }

  get frameId(): string | null {
    return this.init.frameId
  }

  note(layer: OsiLayer, direction: NoteDirection, message: LocalizedMessage): void {
    this.notes.push({ layer, direction, message })
  }

  transmit(target: TransmitTarget, frame: WireFrame, frameId?: string): boolean {
    const id = frameId ?? this.init.frameId
    if (this.init.pduId === null || id === null) throw new Error(`Event ${this.id} has no PDU to transmit`)
    const sent = this.sink.transmit(this, target, frame, id)
    if (!sent) {
      this.note(1, 'out', localizedMessage('simulation:notes.l1.linkDown', { port: target.portId }))
      return false
    }
    if (!this.outPortIds.includes(target.portId)) this.outPortIds.push(target.portId)
    this.outbound ??= frame
    return true
  }

  setOutbound(pdu: Pdu): void {
    this.outbound = pdu
  }

  conclude(action: Exclude<SimAction, ReasonedAction>, layer: OsiLayer, reason?: SimReason): void
  conclude(action: ReasonedAction, layer: OsiLayer, reason: SimReason): void
  conclude(action: SimAction, layer: OsiLayer, reason?: SimReason): void {
    if (REASONED.has(action) && reason === undefined) throw new Error(`Event ${this.id}: '${action}' needs a reason`)
    this.decision = reason === undefined ? { action, layer } : { action, layer, reason }
  }

  /** The finished event; an unconcluded builder is a programmer error of the layer that opened it. */
  toEvent(time: number, seq: number): SimEvent {
    const { decision, init } = this
    if (!decision) throw new Error(`Event ${this.id} at ${init.deviceId} was never concluded`)
    const shown = init.inbound ?? this.outbound
    return {
      id: this.id,
      time,
      seq,
      deviceId: init.deviceId,
      ...(init.lastDeviceId === undefined ? {} : { lastDeviceId: init.lastDeviceId }),
      ...(init.inPortId === undefined ? {} : { inPortId: init.inPortId }),
      outPortIds: [...this.outPortIds],
      flowId: init.flowId,
      pduId: init.pduId,
      frameId: init.frameId,
      protocol: init.protocol ?? (shown ? PduLayers.protocolOf(shown) : null),
      inbound: init.inbound ?? null,
      outbound: this.outbound,
      action: decision.action,
      layer: decision.layer,
      ...(decision.reason === undefined ? {} : { reason: decision.reason }),
      notes: [...this.notes],
      ...(init.causeEventId === undefined ? {} : { causeEventId: init.causeEventId }),
    }
  }
}
