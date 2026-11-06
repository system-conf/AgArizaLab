import type { LocalizedMessage } from '../../domain/Messages'
import { localizedMessage } from '../../i18n/messageKeys'
import {
  type EventBuilder,
  type NoteDirection,
  type OsiLayer,
  type Pdu,
  type ReasonedAction,
  type SimAction,
  SimMessages,
  type SimReason,
  type TransmitTarget,
  type WireFrame,
} from '../contract'

/**
 * The builder an SVI gets for its copy of a frame the bridge already flooded (one event per device and
 * PDU). The upper layers conclude through it as usual; a refusal of the copy ('dropped', 'filtered')
 * becomes a note, because the bridge's own decision ('flooded') is what happened to the frame.
 */
export class BridgedDelivery implements EventBuilder {
  private readonly bridged: EventBuilder
  private readonly interfaceId: string

  constructor(bridged: EventBuilder, interfaceId: string) {
    this.bridged = bridged
    this.interfaceId = interfaceId
  }

  get id(): number {
    return this.bridged.id
  }

  get flowId(): string {
    return this.bridged.flowId
  }

  get pduId(): string | null {
    return this.bridged.pduId
  }

  get frameId(): string | null {
    return this.bridged.frameId
  }

  note(layer: OsiLayer, direction: NoteDirection, message: LocalizedMessage): void {
    this.bridged.note(layer, direction, message)
  }

  transmit(target: TransmitTarget, frame: WireFrame, frameId?: string): boolean {
    return this.bridged.transmit(target, frame, frameId)
  }

  setOutbound(pdu: Pdu): void {
    this.bridged.setOutbound(pdu)
  }

  conclude(action: Exclude<SimAction, ReasonedAction>, layer: OsiLayer, reason?: SimReason): void
  conclude(action: ReasonedAction, layer: OsiLayer, reason: SimReason): void
  conclude(action: SimAction, layer: OsiLayer, reason?: SimReason): void {
    if (action === 'dropped' || action === 'filtered') {
      this.bridged.note(layer, 'in', localizedMessage('simulation:notes.l2.sviCopyDiscarded', { iface: this.interfaceId }))
      if (reason !== undefined) this.bridged.note(layer, 'in', SimMessages.reason(reason))
      return
    }
    if (action === 'timedOut') throw new Error(`Event ${this.id}: an arrival cannot time out`)
    this.bridged.conclude(action, layer, reason)
  }
}
