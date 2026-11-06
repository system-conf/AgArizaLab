import type { Link } from '../../../domain'
import type { SimEvent, SimTransmission } from '../simulationServices'

/** What the map marks for the selected event: the device and the links the PDU came in and went out on. */
export interface EventHighlight {
  readonly deviceId: string
  readonly linkIds: readonly string[]
}

export class EventHighlights {
  static of(event: SimEvent, transmissions: readonly SimTransmission[], links: readonly Link[]): EventHighlight {
    const linkIds: string[] = []
    const inbound = EventHighlights.inboundLink(event, links)
    if (inbound) linkIds.push(inbound.id)
    for (const transmission of transmissions) {
      if (transmission.eventId === event.id && !linkIds.includes(transmission.linkId)) linkIds.push(transmission.linkId)
    }
    return { deviceId: event.deviceId, linkIds }
  }

  /** The link joining the arrival port to the previous device (a radio port has several links). */
  private static inboundLink(event: SimEvent, links: readonly Link[]): Link | undefined {
    const { inPortId, lastDeviceId, deviceId } = event
    if (inPortId === undefined) return undefined
    return links.find((link) => {
      const [here, there] = link.a.deviceId === deviceId && link.a.portId === inPortId ? [link.a, link.b] : [link.b, link.a]
      return here.deviceId === deviceId && here.portId === inPortId && (lastDeviceId === undefined || there.deviceId === lastDeviceId)
    })
  }
}
