import { localizedMessage } from '../../i18n/messageKeys'
import { type L3Interface, L3Interfaces } from '../../net/L3Interfaces'
import { BROADCAST_MAC, type DeviceContext, type LinkSend } from '../contract'
import { ArpResolver } from './ArpResolver'
import { FrameSender } from './FrameSender'
import { LinkInterfaces } from './LinkInterfaces'
import { LinkTables } from './LinkTables'

/**
 * LinkLayer.send for devices that are not the cloud: pick the frame's destination (serial: none;
 * broadcast or a given MAC: no ARP; else the ARP cache, or wait for ARP), encapsulate and transmit,
 * and conclude the request's event ('created' for own packets, 'forwarded' at layer 3 for routed ones).
 */
export class LinkSender {
  static send(ctx: DeviceContext, request: LinkSend): void {
    const iface = L3Interfaces.find(ctx.device, request.interfaceId)
    if (!iface) throw new Error(`${ctx.device.id} has no interface ${request.interfaceId}`)
    const routed = LinkInterfaces.isRouted(ctx, request.event.id)
    const frameId = LinkInterfaces.frameIdFor(ctx, request)
    if (!LinkInterfaces.isUsable(ctx, iface)) return LinkSender.linkDown(ctx, request, iface, frameId)
    const port = iface.portId === undefined ? undefined : LinkInterfaces.port(ctx.device, iface.portId)
    if (port?.medium === 'serial') {
      return LinkSender.finish(ctx, request, iface, frameId, routed, FrameSender.hdlc(iface, request.event, request.packet, frameId))
    }
    const dst = LinkSender.destination(ctx, request, iface)
    if (dst !== null) {
      const copies = FrameSender.ethernet(ctx, iface, request.event, dst, request.packet, frameId)
      return LinkSender.finish(ctx, request, iface, frameId, routed, copies)
    }
    ArpResolver.buffer(ctx, iface, request, frameId, routed)
  }

  /** Destination MAC known without asking ARP now, or null. */
  private static destination(ctx: DeviceContext, request: LinkSend, iface: L3Interface): string | null {
    const { event, linkDestination, nextHopIp } = request
    if (linkDestination?.kind === 'mac') {
      event.note(2, 'out', localizedMessage('simulation:notes.l2.knownDestination', { mac: linkDestination.mac }))
      return linkDestination.mac
    }
    if (linkDestination?.kind === 'broadcast' || LinkInterfaces.isBroadcastHop(iface, nextHopIp)) {
      event.note(2, 'out', localizedMessage('simulation:notes.l2.broadcastDestination'))
      return BROADCAST_MAC
    }
    const entry = LinkTables.arpLookup(ctx, iface.id, nextHopIp)
    if (entry?.state !== 'reachable' || entry.mac === null) return null
    event.note(2, 'out', localizedMessage('simulation:notes.l2.arpCacheHit', { ip: nextHopIp, mac: entry.mac }))
    return entry.mac
  }

  private static finish(ctx: DeviceContext, request: LinkSend, iface: L3Interface, frameId: string, routed: boolean, copies: number): void {
    if (copies === 0) return LinkSender.linkDown(ctx, request, iface, frameId)
    if (routed) request.event.conclude('forwarded', 3)
    else request.event.conclude('created', LinkInterfaces.layerOf(request.packet))
  }

  /** The interface cannot put the packet on a wire: logged here, then the network layer decides. */
  private static linkDown(ctx: DeviceContext, request: LinkSend, iface: L3Interface, frameId: string): void {
    const { event, packet } = request
    event.setOutbound(packet)
    event.note(1, 'out', localizedMessage('simulation:notes.l2.linkDownDrop', { iface: iface.id }))
    event.conclude('dropped', 1, 'linkDown')
    ctx.layers.network.onUndeliverable(ctx, {
      interfaceId: iface.id,
      nextHopIp: request.nextHopIp,
      packet,
      ids: { ...request.ids, frameId },
      reason: 'linkDown',
      droppedEventId: event.id,
      ...(request.ingressInterfaceId === undefined ? {} : { ingressInterfaceId: request.ingressInterfaceId }),
    })
  }
}
