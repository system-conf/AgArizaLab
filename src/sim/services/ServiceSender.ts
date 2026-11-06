import type { LocalizedMessage } from '../../domain/Messages'
import type {
  DeviceContext,
  Ipv4Send,
  Ipv4SendResult,
  LinkDestination,
  PduIds,
  SimNote,
  TcpSegment,
  TransportDelivery,
  UdpDatagram,
} from '../contract'
import { SIM_TTL } from '../contract'

/** What a service sends: a UDP / TCP payload plus the layer-7 notes of its 'created' event. */
export interface ServiceSend {
  readonly ids: PduIds
  readonly dst: string
  readonly src?: string
  readonly ttl?: number
  readonly payload: UdpDatagram | TcpSegment
  readonly egressInterfaceId?: string
  readonly linkDestination?: LinkDestination
  readonly causeEventId?: number
  readonly notes?: readonly LocalizedMessage[]
}

/** `Ipv4Send` with the notes the network layer adds to the 'created' event it logs (`Ipv4Send.notes`). */
export type NotedIpv4Send = Ipv4Send & { readonly notes: readonly SimNote[] }

/** Originates service packets through the network layer (S2). */
export class ServiceSender {
  static send(ctx: DeviceContext, send: ServiceSend): Ipv4SendResult {
    const request: NotedIpv4Send = {
      ids: send.ids,
      dst: send.dst,
      payload: send.payload,
      ...(send.src === undefined ? {} : { src: send.src }),
      ...(send.ttl === undefined ? {} : { ttl: send.ttl }),
      ...(send.egressInterfaceId === undefined ? {} : { egressInterfaceId: send.egressInterfaceId }),
      ...(send.linkDestination === undefined ? {} : { linkDestination: send.linkDestination }),
      ...(send.causeEventId === undefined ? {} : { causeEventId: send.causeEventId }),
      notes: (send.notes ?? []).map((message) => ({ layer: 7, direction: 'out', message })),
    }
    return ctx.layers.network.send(ctx, request)
  }

  /**
   * An answer to `delivery` from the address it was sent to. The internet cloud answers out of the
   * arrival port to the frame's source MAC with the internet reply TTL (docs/SIMULATION.md §7.2).
   */
  static reply(
    ctx: DeviceContext,
    delivery: TransportDelivery,
    payload: UdpDatagram | TcpSegment,
    notes: readonly LocalizedMessage[] = [],
  ): Ipv4SendResult {
    const { packet } = delivery
    const base = { ids: ctx.newPdu(delivery.ids.flowId), dst: packet.src, src: packet.dst, payload, causeEventId: delivery.event.id, notes }
    if (ctx.device.kind !== 'internet') return ServiceSender.send(ctx, base)
    return ServiceSender.send(ctx, {
      ...base,
      ttl: SIM_TTL.internetReply,
      egressInterfaceId: delivery.interfaceId,
      ...(delivery.linkSourceMac === null ? {} : { linkDestination: { kind: 'mac', mac: delivery.linkSourceMac } }),
    })
  }
}
