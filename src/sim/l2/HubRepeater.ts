import { localizedMessage } from '../../i18n/messageKeys'
import type { DeviceContext, EventBuilder, FrameArrival } from '../contract'
import { LinkTables } from './LinkTables'

/**
 * A hub (docs/SIMULATION.md §7.1): layer 1 only, the frame (802.1Q tag included) goes out of every
 * other port whose link works. The lab's loop guard also stops a frame that comes back to the hub, so
 * a cabling loop cannot run forever.
 */
export class HubRepeater {
  static repeat(ctx: DeviceContext, arrival: FrameArrival, event: EventBuilder): void {
    if (LinkTables.seenBefore(ctx, arrival.ids.frameId)) {
      event.note(1, 'in', localizedMessage('simulation:notes.l2.loopSuppressed'))
      return event.conclude('dropped', 1, 'l2Loop')
    }
    event.note(1, 'in', localizedMessage('simulation:notes.l1.hubRepeats'))
    const { device, topology } = ctx
    let sent = 0
    for (const port of device.ports) {
      if (port.id === arrival.portId) continue
      for (const link of topology.linksAt(device.id, port.id)) {
        if (!topology.isUp(link)) continue
        event.note(1, 'out', localizedMessage('simulation:notes.l1.sentOnPort', { port: port.id }))
        if (event.transmit({ portId: port.id, linkId: link.id }, arrival.frame)) sent += 1
      }
    }
    if (sent > 0) return event.conclude('flooded', 1)
    event.note(1, 'out', localizedMessage('simulation:notes.l1.noOtherPort'))
    event.conclude('filtered', 1)
  }
}
