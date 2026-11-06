import { localizedMessage } from '../../i18n/messageKeys'
import { Ipv4 } from '../../engine/Ipv4'
import {
  type ArpPacket,
  BROADCAST_MAC,
  type DeviceContext,
  type EthernetFrame,
  type EventBuilder,
  type FrameArrival,
  type Ipv4SendResult,
  type LinkSend,
  UNSPECIFIED_IP,
} from '../contract'
import { LinkInterfaces } from './LinkInterfaces'

/**
 * The internet cloud's handoff ports (docs/SIMULATION.md §7.1, MODEL_V2 §5): service only toward a
 * router's routed port and only while the provider line is up; proxy ARP for every public address;
 * IPv4 goes to the network layer with the port id as interface id. The cloud never asks ARP itself:
 * its answers go back to the MAC the request came from (`linkDestination`).
 */
export class CloudPorts {
  static receive(ctx: DeviceContext, arrival: FrameArrival, event: EventBuilder): void {
    const { frame } = arrival
    const port = LinkInterfaces.port(ctx.device, arrival.portId)
    if (frame.kind !== 'ethernet' || !port) return event.conclude('dropped', 2, 'unsupported')
    const refusal = CloudPorts.refusal(ctx, arrival.portId, arrival.linkId, event)
    if (refusal) return event.conclude('dropped', 2, refusal)
    if (frame.tag !== undefined) {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.taggedAtNic', { vlan: frame.tag.vid }))
      return event.conclude('dropped', 2, 'vlanNotAllowed')
    }
    const broadcast = frame.dst === BROADCAST_MAC
    if (!broadcast && frame.dst !== port.mac) {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.notForThisInterface', { dst: frame.dst }))
      return event.conclude('dropped', 2, 'notForThisInterface')
    }
    const { payload } = frame
    switch (payload.kind) {
      case 'arp':
        return CloudPorts.receiveArp(ctx, arrival.portId, port.mac ?? ctx.device.baseMac, payload, event)
      case 'ipv4':
        event.note(2, 'in', localizedMessage('simulation:notes.l2.deencapsulated', { protocol: 'IPv4' }))
        return ctx.layers.network.onPacket(ctx, {
          interfaceId: arrival.portId,
          inPortId: arrival.portId,
          packet: payload,
          ids: arrival.ids,
          linkSourceMac: frame.src,
          linkBroadcast: broadcast,
          event,
        })
      default:
        return event.conclude('dropped', 2, 'unsupported')
    }
  }

  /** The cloud answers on the arrival port, to the MAC it was asked from. */
  static send(ctx: DeviceContext, request: LinkSend): void {
    const { event, packet, linkDestination } = request
    const port = LinkInterfaces.port(ctx.device, request.interfaceId)
    if (!port) throw new Error(`${ctx.device.id} has no port ${request.interfaceId}`)
    const routed = LinkInterfaces.isRouted(ctx, event.id)
    const frameId = LinkInterfaces.frameIdFor(ctx, request)
    event.setOutbound(packet)
    if (!CloudPorts.serviceUp(ctx, port.id)) {
      event.note(2, 'out', localizedMessage('simulation:notes.l2.ispServiceDown', { port: port.id }))
      return event.conclude('dropped', 2, 'ispServiceDown')
    }
    if (!linkDestination) {
      event.note(2, 'out', localizedMessage('simulation:notes.l2.cloudNeedsDestination'))
      return event.conclude('dropped', 2, 'unsupported')
    }
    const dst = linkDestination.kind === 'mac' ? linkDestination.mac : BROADCAST_MAC
    const frame: EthernetFrame = { kind: 'ethernet', src: port.mac ?? ctx.device.baseMac, dst, payload: packet }
    event.note(2, 'out', localizedMessage('simulation:notes.l2.encapsulated', { src: frame.src, dst }))
    if (!event.transmit({ portId: port.id }, frame, frameId)) return event.conclude('dropped', 1, 'linkDown')
    if (routed) event.conclude('forwarded', 3)
    else event.conclude('created', LinkInterfaces.layerOf(packet))
  }

  /** interfaceReady for a cloud port: a working link with provider service. */
  static readiness(ctx: DeviceContext, portId: string): Ipv4SendResult {
    const port = LinkInterfaces.port(ctx.device, portId)
    if (!port) return { ok: false, reason: 'invalidConfig' }
    if (!port.adminUp) return { ok: false, reason: 'portDisabled' }
    const { topology } = ctx
    if (!topology.linksAt(ctx.device.id, portId).some((link) => topology.isUp(link))) return { ok: false, reason: 'cableDisconnected' }
    if (!CloudPorts.serviceUp(ctx, portId)) return { ok: false, reason: 'ispServiceDown' }
    return { ok: true, src: UNSPECIFIED_IP, interfaceId: portId }
  }

  private static serviceUp(ctx: DeviceContext, portId: string): boolean {
    return ctx.device.internet?.handoffs.find((handoff) => handoff.portId === portId)?.serviceUp !== false
  }

  /** Why the port serves nobody on this link, or null. */
  private static refusal(ctx: DeviceContext, portId: string, linkId: string, event: EventBuilder): 'ispNoService' | 'ispServiceDown' | null {
    const link = ctx.network.links.find((candidate) => candidate.id === linkId)
    const far = link ? ctx.topology.farEnd(link, ctx.device.id, portId) : undefined
    if (far?.port?.role !== 'routed') {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.ispNoService', { port: portId }))
      return 'ispNoService'
    }
    if (!CloudPorts.serviceUp(ctx, portId)) {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.ispServiceDown', { port: portId }))
      return 'ispServiceDown'
    }
    return null
  }

  /** Proxy ARP: every public address is "here", behind the provider. */
  private static receiveArp(ctx: DeviceContext, portId: string, ownMac: string, arp: ArpPacket, event: EventBuilder): void {
    if (arp.operation === 'reply') return event.conclude('delivered', 2)
    if (!Ipv4.isPublic(arp.targetIp)) {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.cloudPrivateArp', { ip: arp.targetIp }))
      return event.conclude('dropped', 2, 'arpNotForUs')
    }
    event.note(2, 'in', localizedMessage('simulation:notes.l2.cloudProxyArp', { ip: arp.targetIp }))
    event.conclude('replied', 2)
    const reply = ctx.openEvent({ flowId: event.flowId, ids: ctx.newPdu(event.flowId), causeEventId: event.id })
    reply.note(2, 'out', localizedMessage('simulation:notes.l2.arpReplyCreated', { ip: arp.targetIp, mac: ownMac }))
    const payload: ArpPacket = { kind: 'arp', operation: 'reply', senderMac: ownMac, senderIp: arp.targetIp, targetMac: arp.senderMac, targetIp: arp.senderIp }
    reply.transmit({ portId }, { kind: 'ethernet', src: ownMac, dst: arp.senderMac, payload })
    reply.conclude('created', 2)
  }
}
