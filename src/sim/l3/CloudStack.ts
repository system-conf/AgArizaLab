import { Ipv4 } from '../../net/Ipv4'
import type { DeviceContext, Ipv4Delivery } from '../contract'
import type { IcmpResponder } from './IcmpResponder'
import { L3Notes } from './L3Notes'

/**
 * The ISP cloud (docs/SIMULATION.md §7.2): every public address is the cloud itself. It answers echo
 * requests (TTL 118) and hands UDP / TCP to the services (DNS resolvers, web), always back out of the
 * arrival port to the frame's source MAC; anything else gets silence, private destinations are dropped.
 */
export class CloudStack {
  private readonly responder: IcmpResponder

  constructor(responder: IcmpResponder) {
    this.responder = responder
  }

  receive(ctx: DeviceContext, delivery: Ipv4Delivery): void {
    const { packet, event } = delivery
    if (!Ipv4.isPublic(packet.dst)) {
      event.note(3, 'in', L3Notes.of('ispNoRoute', { dst: packet.dst }))
      event.conclude('dropped', 3, 'ispNoRoute')
      return
    }
    event.note(3, 'in', L3Notes.of('internetDelivers', { dst: packet.dst }))
    const payload = packet.payload
    const via = {
      egressInterfaceId: delivery.interfaceId,
      ...(delivery.linkSourceMac === null ? {} : { linkDestination: { kind: 'mac' as const, mac: delivery.linkSourceMac } }),
    }
    switch (payload.kind) {
      case 'icmp':
        if (payload.type !== 'echoRequest') break
        event.note(3, 'in', L3Notes.of('echoRequestReceived', { sequence: payload.sequence, src: packet.src }))
        event.conclude('replied', 3)
        this.responder.echoReply(ctx, packet, payload, { flowId: delivery.ids.flowId, causeEventId: event.id }, { via })
        return
      case 'udp':
      case 'tcp':
        if (!ctx.layers.services.listens(ctx, payload.kind, packet.dst, payload.dstPort)) break
        event.note(4, 'in', L3Notes.of('toTransport', { protocol: payload.kind.toUpperCase(), port: payload.dstPort }))
        event.conclude('delivered', 4)
        ctx.layers.services.onDatagram(ctx, { interfaceId: delivery.interfaceId, packet, ids: delivery.ids, linkSourceMac: delivery.linkSourceMac, event })
        return
    }
    event.note(3, 'in', L3Notes.of('ispIgnores'))
    event.conclude('dropped', 3, payload.kind === 'icmp' ? 'unsupported' : 'portUnreachable')
  }
}
