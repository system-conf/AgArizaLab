import type { HostPort, RoutedPort } from '../../domain'
import { localizedMessage } from '../../i18n/messageKeys'
import { type L3Interface, L3Interfaces } from '../../net/L3Interfaces'
import { BROADCAST_MAC, type DeviceContext, type EthernetFrame, type EventBuilder, type FrameArrival, type PduIds } from '../contract'
import { ArpResponder } from './ArpResponder'
import { BridgeVlans } from './BridgeVlans'
import { LinkInterfaces } from './LinkInterfaces'

/**
 * Layer-3 endpoints (docs/SIMULATION.md §7.1): NICs, routed ports, their 802.1Q sub-interfaces and
 * SVIs. They take frames for their own MAC and broadcasts, hand ARP to the ARP responder and IPv4 to
 * the network layer. Serial ports speak HDLC.
 */
export class Endpoints {
  /** A frame on a host or routed port. */
  static receivePort(ctx: DeviceContext, arrival: FrameArrival, event: EventBuilder, port: HostPort | RoutedPort): void {
    const { frame } = arrival
    if (frame.kind === 'hdlc') return Endpoints.receiveHdlc(ctx, arrival, event, port)
    if (frame.kind !== 'ethernet' || port.medium === 'serial') return event.conclude('dropped', 2, 'unsupported')
    const iface = Endpoints.interfaceFor(ctx, port, frame, event)
    if (!iface) return
    Endpoints.accept(ctx, iface, port.id, BridgeVlans.tagged(frame, null), event, arrival.ids)
  }

  /** Destination MAC filter, then ARP or IPv4 to the interface. `frame` is untagged. */
  static accept(ctx: DeviceContext, iface: L3Interface, inPortId: string, frame: EthernetFrame, event: EventBuilder, ids: PduIds): void {
    if (!iface.adminUp) {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.interfaceShut', { iface: iface.id }))
      return event.conclude('dropped', 2, 'portDisabled')
    }
    const broadcast = frame.dst === BROADCAST_MAC
    if (!broadcast && frame.dst !== LinkInterfaces.macOf(ctx.device, iface)) {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.notForThisInterface', { dst: frame.dst }))
      return event.conclude('dropped', 2, 'notForThisInterface')
    }
    event.note(2, 'in', localizedMessage('simulation:notes.l2.frameAccepted', { dst: frame.dst }))
    const { payload } = frame
    switch (payload.kind) {
      case 'arp':
        return ArpResponder.receive(ctx, iface, frame, payload, event)
      case 'ipv4':
        event.note(2, 'in', localizedMessage('simulation:notes.l2.deencapsulated', { protocol: 'IPv4' }))
        return ctx.layers.network.onPacket(ctx, {
          interfaceId: iface.id,
          inPortId,
          packet: payload,
          ids,
          linkSourceMac: frame.src,
          linkBroadcast: broadcast,
          event,
        })
      default:
        return event.conclude('dropped', 2, 'unsupported')
    }
  }

  private static receiveHdlc(ctx: DeviceContext, arrival: FrameArrival, event: EventBuilder, port: HostPort | RoutedPort): void {
    const iface = L3Interfaces.find(ctx.device, port.id)
    if (port.medium !== 'serial' || !iface || arrival.frame.kind !== 'hdlc' || arrival.frame.payload.kind !== 'ipv4') {
      return event.conclude('dropped', 2, 'unsupported')
    }
    event.note(2, 'in', localizedMessage('simulation:notes.l2.hdlcReceived'))
    ctx.layers.network.onPacket(ctx, {
      interfaceId: iface.id,
      inPortId: port.id,
      packet: arrival.frame.payload,
      ids: arrival.ids,
      linkSourceMac: null,
      linkBroadcast: false,
      event,
    })
  }

  /** NIC: untagged only. Routed port: untagged → native sub-interface or the port; tag v → sub-interface v. */
  private static interfaceFor(ctx: DeviceContext, port: HostPort | RoutedPort, frame: EthernetFrame, event: EventBuilder): L3Interface | undefined {
    const tag = frame.tag?.vid ?? null
    const own = L3Interfaces.of(ctx.device).filter((iface) => iface.portId === port.id)
    const physical = own.find((iface) => iface.id === port.id)
    if (port.role === 'host') {
      if (tag === null) return Endpoints.found(physical, event)
      event.note(2, 'in', localizedMessage('simulation:notes.l2.taggedAtNic', { vlan: tag }))
      event.conclude('dropped', 2, 'vlanNotAllowed')
      return undefined
    }
    const subs = own.filter((iface) => iface.kind === 'subInterface')
    if (tag === null) {
      const native = subs.find((iface) => iface.native)
      if (native) event.note(2, 'in', localizedMessage('simulation:notes.l2.nativeSubInterface', { iface: native.id }))
      else if (physical) event.note(2, 'in', localizedMessage('simulation:notes.l2.untaggedRouted', { iface: physical.id }))
      return Endpoints.found(native ?? physical, event)
    }
    const sub = subs.find((iface) => iface.vlan === tag)
    if (sub) {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.subInterfaceIngress', { vlan: tag, iface: sub.id }))
      return sub
    }
    event.note(2, 'in', localizedMessage('simulation:notes.l2.noSubInterface', { vlan: tag, port: port.id }))
    event.conclude('dropped', 2, 'noSubInterface')
    return undefined
  }

  /** Every port with an address has its interface; anything else is a frame the port cannot take. */
  private static found(iface: L3Interface | undefined, event: EventBuilder): L3Interface | undefined {
    if (!iface) event.conclude('dropped', 2, 'unsupported')
    return iface
  }
}
