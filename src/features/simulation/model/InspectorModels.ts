import type { LocalizedMessage } from '../../../domain/Messages'
import { localizedMessage } from '../../../i18n/messageKeys'
import {
  PduLayers,
  SimMessages,
  type InspectorLayer,
  type InspectorModel,
  type OsiLayer,
  type Pdu,
  type PduLayerView,
  type SimAction,
  type SimEvent,
  type SimProtocol,
} from '../simulationServices'

/** An inspector row plus the protocols of that layer (chips beside the layer name). */
export interface InspectorRow extends InspectorLayer {
  readonly protocols: readonly SimProtocol[]
}

/** The contract's inspector model plus what the panel header shows. */
export interface InspectorView extends InspectorModel {
  readonly inLayers: readonly InspectorRow[]
  readonly outLayers: readonly InspectorRow[]
  readonly time: number
  readonly action: SimAction
  readonly protocol: SimProtocol | null
  readonly lastDeviceId?: string
  /** Drop / timeout reason. */
  readonly reason: LocalizedMessage | null
  readonly causeEventId?: number
}

type Direction = 'in' | 'out'

/**
 * Builds the PDU inspector of one event (docs/SIMULATION.md §8; Packet Tracer "PDU Information at
 * Device"). In layers are listed in the order the device handled them (cable upwards), out layers
 * likewise (application down to the cable). Layer 1 is the port; the other rows join the header
 * views of `PduLayers.describe` with the decision notes of that layer and direction.
 */
export class InspectorModels {
  static build(event: SimEvent, nameOf: (deviceId: string) => string): InspectorView {
    const inbound = event.inbound ? PduLayers.describe(event.inbound) : []
    const outbound = event.outbound ? PduLayers.describe(event.outbound) : []
    return {
      eventId: event.id,
      deviceId: event.deviceId,
      inLayers: InspectorModels.rows(event, 'in', event.inbound, inbound),
      outLayers: InspectorModels.rows(event, 'out', event.outbound, outbound),
      inboundDetails: inbound,
      outboundDetails: outbound,
      decision: localizedMessage(`simulation:ui.decisions.${event.action}`, { device: nameOf(event.deviceId) }),
      time: event.time,
      action: event.action,
      protocol: event.protocol,
      ...(event.lastDeviceId !== undefined ? { lastDeviceId: event.lastDeviceId } : {}),
      reason: event.reason ? SimMessages.reason(event.reason) : null,
      ...(event.causeEventId !== undefined ? { causeEventId: event.causeEventId } : {}),
    }
  }

  private static rows(event: SimEvent, direction: Direction, pdu: Pdu | null, views: readonly PduLayerView[]): InspectorRow[] {
    const notes = event.notes.filter((note) => note.direction === direction)
    const ports = direction === 'in' ? (event.inPortId !== undefined ? [event.inPortId] : []) : event.outPortIds
    const layers = new Set<OsiLayer>([...views.map((view) => view.layer), ...notes.map((note) => note.layer)])
    // The cable row exists whenever a PDU crossed a port or layer 1 has something to say.
    if (pdu !== null && ports.length > 0) layers.add(1)
    const ordered = [...layers].sort((a, b) => (direction === 'in' ? a - b : b - a))
    return ordered.map((layer) => {
      const protocols = views.filter((view) => view.layer === layer).map((view) => view.protocol)
      return {
        layer,
        title: InspectorModels.title(layer, protocols, ports),
        notes: notes.filter((note) => note.layer === layer).map((note) => note.message),
        protocols,
      }
    })
  }

  private static title(layer: OsiLayer, protocols: readonly SimProtocol[], ports: readonly string[]): LocalizedMessage {
    if (layer === 1) {
      return ports.length > 0 ? localizedMessage('simulation:ui.inspector.port', { port: ports.join(', ') }) : localizedMessage('simulation:ui.inspector.noPort')
    }
    const first = protocols[0]
    return first !== undefined ? SimMessages.protocol(first) : SimMessages.layer(layer)
  }
}
