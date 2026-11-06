import type { Device, RadioPort, SwitchedPort } from '../../domain'
import { localizedMessage } from '../../i18n/messageKeys'
import { type L3Interface, L3Interfaces } from '../../engine/L3Interfaces'
import type { DeviceContext, EthernetFrame, EventBuilder, FrameArrival, PduIds } from '../contract'
import { BridgedDelivery } from './BridgedDelivery'
import { type EgressTarget, BridgeVlans } from './BridgeVlans'
import { Endpoints } from './Endpoints'
import { BOOT_FLOW, LinkInterfaces } from './LinkInterfaces'
import { LinkTables } from './LinkTables'

/** Where a frame entered the bridge. */
interface Ingress {
  readonly portId: string
  readonly linkId: string
  readonly radio: boolean
}

/**
 * Transparent bridge of switches, L3 switches, access points and wireless routers (docs/SIMULATION.md
 * §7.1): ingress VLAN, L2 loop guard, MAC learning, forwarding / filtering / flooding per VLAN, and the
 * device's SVIs as endpoints inside their VLAN (with the device's base MAC).
 */
export class Bridge {
  static receive(ctx: DeviceContext, arrival: FrameArrival, event: EventBuilder, port: SwitchedPort | RadioPort): void {
    const { frame } = arrival
    if (frame.kind !== 'ethernet') return event.conclude('dropped', 2, 'unsupported')
    const vlan = BridgeVlans.ingress(ctx, arrival, port, frame, event)
    if (typeof vlan !== 'number') return event.conclude('dropped', 2, vlan)
    if (LinkTables.seenBefore(ctx, arrival.ids.frameId)) {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.loopSuppressed'))
      return event.conclude('dropped', 2, 'l2Loop')
    }
    Bridge.learn(ctx, event, vlan, frame.src, port.id, arrival.ids.flowId)
    const ingress: Ingress = { portId: port.id, linkId: arrival.linkId, radio: port.role === 'radio' }
    Bridge.forward(ctx, event, vlan, BridgeVlans.tagged(frame, null), ingress, arrival.ids)
  }

  /**
   * Sends a frame of the device's SVI into its VLAN: known unicast to the learned port, anything else to
   * every port of the VLAN. Returns the number of copies sent.
   */
  static originate(ctx: DeviceContext, event: EventBuilder, svi: L3Interface, frame: EthernetFrame, frameId: string): number {
    const vlan = svi.vlan ?? 1
    event.note(2, 'out', localizedMessage('simulation:notes.l2.sviEgress', { iface: svi.id, vlan }))
    LinkTables.remember(ctx, frameId)
    const entry = LinkInterfaces.isGroupMac(frame.dst) ? undefined : LinkTables.macLookup(ctx, vlan, frame.dst)
    if (entry) event.note(2, 'out', localizedMessage('simulation:notes.l2.macKnown', { mac: frame.dst, port: entry.portId }))
    else if (!LinkInterfaces.isGroupMac(frame.dst)) event.note(2, 'out', localizedMessage('simulation:notes.l2.macUnknown', { mac: frame.dst, vlan }))
    const scope = entry ? { onlyPortId: entry.portId } : {}
    return Bridge.sendTo(event, vlan, frame, BridgeVlans.targets(ctx, vlan, frame.dst, scope), frameId)
  }

  /** The SVI of the VLAN, when the device has one. */
  static svi(device: Device, vlan: number): L3Interface | undefined {
    return L3Interfaces.of(device).find((iface) => iface.kind === 'svi' && iface.vlan === vlan)
  }

  private static learn(ctx: DeviceContext, event: EventBuilder, vlan: number, src: string, portId: string, flowId: string): void {
    if (LinkInterfaces.isGroupMac(src) || flowId === BOOT_FLOW) return
    const outcome = LinkTables.learnMac(ctx, vlan, src, portId)
    if (outcome === 'learned') event.note(2, 'in', localizedMessage('simulation:notes.l2.macLearned', { mac: src, port: portId, vlan }))
    else if (outcome === 'refreshed') event.note(2, 'in', localizedMessage('simulation:notes.l2.macRefreshed', { mac: src, port: portId, vlan }))
  }

  private static forward(ctx: DeviceContext, event: EventBuilder, vlan: number, frame: EthernetFrame, ingress: Ingress, ids: PduIds): void {
    const svi = Bridge.svi(ctx.device, vlan)
    if (svi && frame.dst === ctx.device.baseMac) {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.sviDelivered', { iface: svi.id }))
      return Endpoints.accept(ctx, svi, ingress.portId, frame, event, ids)
    }
    if (LinkInterfaces.isGroupMac(frame.dst)) {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.broadcastFlooded', { vlan }))
      Bridge.flood(ctx, event, vlan, frame, ingress)
      if (!svi) return
      event.note(2, 'in', localizedMessage('simulation:notes.l2.sviCopy', { iface: svi.id }))
      return Endpoints.accept(ctx, svi, ingress.portId, frame, new BridgedDelivery(event, svi.id), ids)
    }
    const entry = LinkTables.macLookup(ctx, vlan, frame.dst)
    if (!entry) {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.macUnknown', { mac: frame.dst, vlan }))
      return Bridge.flood(ctx, event, vlan, frame, ingress)
    }
    if (entry.portId === ingress.portId && !ingress.radio) {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.sameSegment'))
      return event.conclude('filtered', 2, 'sameSegment')
    }
    event.note(2, 'in', localizedMessage('simulation:notes.l2.macKnown', { mac: frame.dst, port: entry.portId }))
    const targets = BridgeVlans.targets(ctx, vlan, frame.dst, { onlyPortId: entry.portId, exceptLinkId: ingress.linkId })
    if (Bridge.sendTo(event, vlan, frame, targets) === 0) return event.conclude('dropped', 1, 'linkDown')
    event.conclude('forwarded', 2)
  }

  /** Broadcast / unknown unicast: every other port of the VLAN. */
  private static flood(ctx: DeviceContext, event: EventBuilder, vlan: number, frame: EthernetFrame, ingress: Ingress): void {
    const scope = ingress.radio ? { exceptLinkId: ingress.linkId } : { exceptPortId: ingress.portId }
    if (Bridge.sendTo(event, vlan, frame, BridgeVlans.targets(ctx, vlan, frame.dst, scope)) > 0) return event.conclude('flooded', 2)
    event.note(2, 'out', localizedMessage('simulation:notes.l2.floodNoPorts', { vlan }))
    event.conclude('filtered', 2)
  }

  private static sendTo(event: EventBuilder, vlan: number, frame: EthernetFrame, targets: readonly EgressTarget[], frameId?: string): number {
    let sent = 0
    for (const target of targets) {
      if (target.ssid !== undefined) {
        event.note(2, 'out', localizedMessage('simulation:notes.l2.radioEgress', { port: target.portId, ssid: target.ssid }))
      } else if (target.tag === null) {
        event.note(2, 'out', localizedMessage('simulation:notes.l2.untaggedEgress', { port: target.portId, vlan }))
      } else {
        event.note(2, 'out', localizedMessage('simulation:notes.l2.taggedEgress', { port: target.portId, vlan }))
      }
      const where = target.linkId === undefined ? { portId: target.portId } : { portId: target.portId, linkId: target.linkId }
      if (event.transmit(where, BridgeVlans.tagged(frame, target.tag), frameId)) sent += 1
    }
    return sent
  }
}
