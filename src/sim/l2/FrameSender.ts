import { localizedMessage } from '../../i18n/messageKeys'
import type { L3Interface } from '../../net/L3Interfaces'
import type { ArpPacket, DeviceContext, EthernetFrame, EventBuilder, Ipv4Packet } from '../contract'
import { Bridge } from './Bridge'
import { LinkInterfaces } from './LinkInterfaces'

/**
 * Puts frames of a layer-3 interface on the wire: NICs and routed ports untagged from the port's MAC,
 * sub-interfaces tagged (unless native) from the physical port's MAC, SVIs through the device's own
 * bridge with the base MAC, serial ports as HDLC.
 */
export class FrameSender {
  /** Returns the number of copies sent (an SVI may flood several). */
  static ethernet(ctx: DeviceContext, iface: L3Interface, event: EventBuilder, dst: string, payload: ArpPacket | Ipv4Packet, frameId?: string): number {
    const frame: EthernetFrame = { kind: 'ethernet', src: LinkInterfaces.macOf(ctx.device, iface), dst, payload }
    if (payload.kind === 'ipv4') event.note(2, 'out', localizedMessage('simulation:notes.l2.encapsulated', { src: frame.src, dst }))
    if (iface.kind === 'svi') {
      const id = frameId ?? event.frameId
      if (id === null) throw new Error(`Event ${event.id} has no frame to send`)
      return Bridge.originate(ctx, event, iface, frame, id)
    }
    if (iface.portId === undefined) return 0
    const tagged = iface.kind === 'subInterface' && !iface.native && iface.vlan !== undefined
    if (tagged) event.note(2, 'out', localizedMessage('simulation:notes.l2.encapsulatedTagged', { iface: iface.id, vlan: iface.vlan ?? 0 }))
    const wire: EthernetFrame = tagged ? { ...frame, tag: { vid: iface.vlan ?? 0, pcp: 0 } } : frame
    return event.transmit({ portId: iface.portId }, wire, frameId) ? 1 : 0
  }

  /** Serial link: HDLC, no addresses. */
  static hdlc(iface: L3Interface, event: EventBuilder, packet: Ipv4Packet, frameId?: string): number {
    event.note(2, 'out', localizedMessage('simulation:notes.l2.hdlcEncapsulated'))
    if (iface.portId === undefined) return 0
    return event.transmit({ portId: iface.portId }, { kind: 'hdlc', payload: packet }, frameId) ? 1 : 0
  }
}
