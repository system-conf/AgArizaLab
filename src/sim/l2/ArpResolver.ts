import type { LocalizedMessage } from '../../domain/Messages'
import { localizedMessage } from '../../i18n/messageKeys'
import { Ipv4 } from '../../net/Ipv4'
import { type L3Interface, L3Interfaces } from '../../net/L3Interfaces'
import {
  BROADCAST_MAC,
  type DeviceContext,
  type LinkSend,
  type LinkTimer,
  type PendingPacket,
  SIM_TIMING,
  type Undeliverable,
  UNSPECIFIED_IP,
  ZERO_MAC,
} from '../contract'
import { FrameSender } from './FrameSender'
import { LinkInterfaces } from './LinkInterfaces'
import { LinkTables } from './LinkTables'

/**
 * Address resolution on the sending side (docs/SIMULATION.md §3.4, §7.1): packets wait in
 * `runtime.link.pending` while ARP asks (3 requests, 1000 ms apart); a reply releases them as 'sent'
 * with a new frame id, silence drops them (`arpTimeout`) and tells the network layer.
 */
export class ArpResolver {
  /** The next hop is not resolved: the packet waits, and an ARP request goes out unless one already did. */
  static buffer(ctx: DeviceContext, iface: L3Interface, request: LinkSend, frameId: string, routed: boolean): void {
    const { event, packet, nextHopIp } = request
    event.setOutbound(packet)
    event.note(2, 'out', localizedMessage('simulation:notes.l2.packetBuffered', { ip: nextHopIp }))
    event.conclude('buffered', routed ? 3 : LinkInterfaces.layerOf(packet))
    LinkTables.addPending(ctx, {
      interfaceId: iface.id,
      nextHopIp,
      packet,
      ids: { ...request.ids, frameId },
      bufferedEventId: event.id,
      queuedAt: ctx.now,
      ...(request.ingressInterfaceId === undefined ? {} : { ingressInterfaceId: request.ingressInterfaceId }),
    })
    if (LinkTables.arpLookup(ctx, iface.id, nextHopIp)?.state === 'incomplete') {
      event.note(2, 'out', localizedMessage('simulation:notes.l2.arpAlreadyPending', { ip: nextHopIp }))
      return
    }
    LinkTables.putArp(ctx, { interfaceId: iface.id, ip: nextHopIp, mac: null, state: 'incomplete', type: 'dynamic', updatedAt: ctx.now, expiresAt: null, attempts: 1 })
    ArpResolver.request(ctx, iface, nextHopIp, request.ids.flowId, event.id, 1)
    ctx.schedule(SIM_TIMING.arpRetryMs, { layer: 'link', kind: 'arpRetry', interfaceId: iface.id, ip: nextHopIp })
  }

  /** Next request, or failure after the last one. Stale timers (resolved, flushed) do nothing. */
  static onRetry(ctx: DeviceContext, timer: LinkTimer): void {
    const iface = L3Interfaces.find(ctx.device, timer.interfaceId)
    const entry = LinkTables.arpLookup(ctx, timer.interfaceId, timer.ip)
    if (!iface || entry?.state !== 'incomplete') return
    if (entry.attempts >= SIM_TIMING.arpAttempts) return ArpResolver.fail(ctx, iface, timer.ip, entry.attempts)
    const attempts = entry.attempts + 1
    LinkTables.putArp(ctx, { ...entry, attempts, updatedAt: ctx.now })
    const first = ctx.runtime.link.pending.find((packet) => packet.interfaceId === iface.id && packet.nextHopIp === timer.ip)
    ArpResolver.request(ctx, iface, timer.ip, first?.ids.flowId ?? `bg:${ctx.device.id}`, first?.bufferedEventId, attempts)
    ctx.schedule(SIM_TIMING.arpRetryMs, timer)
  }

  /** The neighbour answered: cache it and release its packets. */
  static learn(ctx: DeviceContext, iface: L3Interface, ip: string, mac: string): void {
    const known = LinkTables.arpLookup(ctx, iface.id, ip)
    if (known?.type === 'static') return ArpResolver.release(ctx, iface, ip, known.mac ?? mac)
    LinkTables.putArp(ctx, {
      interfaceId: iface.id,
      ip,
      mac,
      state: 'reachable',
      type: 'dynamic',
      updatedAt: ctx.now,
      expiresAt: ctx.now + LinkInterfaces.arpAgeMs(ctx.device),
      attempts: known?.attempts ?? 0,
    })
    ArpResolver.release(ctx, iface, ip, mac)
  }

  /** A waiting packet that will never leave: logged as dropped, then handed to the network layer. */
  static dropPending(ctx: DeviceContext, packet: PendingPacket, reason: Undeliverable['reason'], message: LocalizedMessage): void {
    const event = ctx.openEvent({ flowId: packet.ids.flowId, ids: packet.ids, causeEventId: packet.bufferedEventId })
    event.setOutbound(packet.packet)
    event.note(2, 'out', message)
    event.conclude('dropped', reason === 'linkDown' ? 1 : 2, reason)
    ctx.layers.network.onUndeliverable(ctx, {
      interfaceId: packet.interfaceId,
      nextHopIp: packet.nextHopIp,
      packet: packet.packet,
      ids: packet.ids,
      reason,
      droppedEventId: event.id,
      ...(packet.ingressInterfaceId === undefined ? {} : { ingressInterfaceId: packet.ingressInterfaceId }),
    })
  }

  private static request(ctx: DeviceContext, iface: L3Interface, ip: string, flowId: string, causeEventId: number | undefined, attempt: number): void {
    const event = ctx.openEvent({ flowId, ids: ctx.newPdu(flowId), ...(causeEventId === undefined ? {} : { causeEventId }) })
    event.note(
      2,
      'out',
      attempt === 1
        ? localizedMessage('simulation:notes.l2.arpRequestCreated', { ip })
        : localizedMessage('simulation:notes.l2.arpRetry', { ip, attempt, attempts: SIM_TIMING.arpAttempts }),
    )
    const senderIp = Ipv4.isValid(iface.address) ? iface.address : UNSPECIFIED_IP
    const senderMac = LinkInterfaces.macOf(ctx.device, iface)
    FrameSender.ethernet(ctx, iface, event, BROADCAST_MAC, { kind: 'arp', operation: 'request', senderMac, senderIp, targetMac: ZERO_MAC, targetIp: ip })
    event.conclude('created', 2)
  }

  private static release(ctx: DeviceContext, iface: L3Interface, ip: string, mac: string): void {
    const waiting = LinkTables.takePending(ctx, (packet) => packet.interfaceId === iface.id && packet.nextHopIp === ip)
    for (const packet of waiting) {
      const ids = { ...packet.ids, frameId: ctx.newFrameId() }
      const event = ctx.openEvent({ flowId: ids.flowId, ids, causeEventId: packet.bufferedEventId })
      event.note(2, 'out', localizedMessage('simulation:notes.l2.packetReleased', { ip }))
      if (FrameSender.ethernet(ctx, iface, event, mac, packet.packet) > 0) {
        event.conclude('sent', packet.ingressInterfaceId === undefined ? LinkInterfaces.layerOf(packet.packet) : 3)
        continue
      }
      event.conclude('dropped', 1, 'linkDown')
      ctx.layers.network.onUndeliverable(ctx, {
        interfaceId: packet.interfaceId,
        nextHopIp: packet.nextHopIp,
        packet: packet.packet,
        ids,
        reason: 'linkDown',
        droppedEventId: event.id,
        ...(packet.ingressInterfaceId === undefined ? {} : { ingressInterfaceId: packet.ingressInterfaceId }),
      })
    }
  }

  private static fail(ctx: DeviceContext, iface: L3Interface, ip: string, attempts: number): void {
    LinkTables.removeArp(ctx, iface.id, ip)
    const waiting = LinkTables.takePending(ctx, (packet) => packet.interfaceId === iface.id && packet.nextHopIp === ip)
    const message = localizedMessage('simulation:notes.l2.arpTimeout', { ip, attempts })
    for (const packet of waiting) ArpResolver.dropPending(ctx, packet, 'arpTimeout', message)
  }
}
