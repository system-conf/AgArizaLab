import type { LocalizedMessage } from '../../domain/Messages'
import { L3Interfaces } from '../../engine/L3Interfaces'
import {
  type DeviceContext,
  type EventBuilder,
  type IcmpEcho,
  type IcmpError,
  type IcmpUnreachableCode,
  type Ipv4Packet,
  type LinkDestination,
  type PduIds,
  PduLayers,
  type TcpFlag,
  type TcpSegment,
} from '../contract'
import { InterfaceAddresses } from './InterfaceAddresses'
import { L3Notes } from './L3Notes'
import type { PacketSender } from './PacketSender'

/** A packet an ICMP error is about. */
export interface ErrorCause {
  readonly packet: Ipv4Packet
  readonly ids: PduIds
  /** The event of the offending packet (its arrival, or the link layer's ARP drop). */
  readonly causeEventId: number
  /** Arrived as a layer-2 broadcast. */
  readonly linkBroadcast: boolean
  /** L3 interface it arrived on: the error is sourced from it (docs/SIMULATION.md §7.2). */
  readonly ingressInterfaceId?: string
  /** Source of the error instead of the ingress interface (port unreachable: the address that was asked). */
  readonly sourceIp?: string
  /** A note to log on the event that carried the offending packet when no error may be sent. */
  readonly event?: EventBuilder
}

export type ErrorKind = { readonly type: 'unreachable'; readonly code: IcmpUnreachableCode } | { readonly type: 'timeExceeded' }

/** An answer that leaves on the arrival port without a routing lookup (the cloud). */
export interface ReturnPath {
  readonly egressInterfaceId: string
  readonly linkDestination?: LinkDestination
}

/** Answers the network layer gives: echo replies, ICMP errors (never about errors or broadcasts), TCP resets. */
export class IcmpResponder {
  private readonly sender: PacketSender

  constructor(sender: PacketSender) {
    this.sender = sender
  }

  /** Echo reply from the address the request was sent to (RFC 1122), in the request's flow. */
  echoReply(ctx: DeviceContext, request: Ipv4Packet, echo: IcmpEcho, cause: { flowId: string; causeEventId: number }, options: { ttl?: number; via?: ReturnPath } = {}): void {
    const payload: IcmpEcho = { ...echo, type: 'echoReply' }
    const { causeEventId } = cause
    this.sender.send(
      ctx,
      {
        ids: ctx.newPdu(cause.flowId),
        dst: request.src,
        src: request.dst,
        payload,
        causeEventId,
        ...(options.ttl === undefined ? {} : { ttl: options.ttl }),
        ...IcmpResponder.returnPath(options.via),
      },
      [L3Notes.of('echoReplyCreated', { dst: request.src })],
    )
  }

  /**
   * ICMP destination unreachable / time exceeded back to the packet's source, from the ingress
   * interface (else the device's first addressed interface). RFC 1122: never about an ICMP error, a
   * broadcast or a packet without a unicast source.
   */
  error(ctx: DeviceContext, cause: ErrorCause, kind: ErrorKind, notes: readonly LocalizedMessage[] = []): void {
    const { packet } = cause
    if (!this.mayReport(ctx, cause)) {
      cause.event?.note(3, 'out', L3Notes.of('noIcmpAboutIcmpError'))
      return
    }
    const ingress = cause.ingressInterfaceId === undefined ? undefined : L3Interfaces.find(ctx.device, cause.ingressInterfaceId)
    const src = cause.sourceIp ?? InterfaceAddresses.sourceAddress(ctx.topology, ctx.device, ingress)
    if (src === '') return
    const original = PduLayers.quote(packet)
    const payload: IcmpError =
      kind.type === 'timeExceeded'
        ? { kind: 'icmp', type: 'timeExceeded', code: 'ttlInTransit', original }
        : { kind: 'icmp', type: 'destinationUnreachable', code: kind.code, original }
    const sent = kind.type === 'unreachable' ? [L3Notes.of('unreachableSent', { code: kind.code, dst: packet.src })] : []
    this.sender.send(ctx, { ids: ctx.newPdu(cause.ids.flowId), dst: packet.src, src, payload, causeEventId: cause.causeEventId }, [...notes, ...sent])
  }

  /** The error a sender reports to itself when its own ARP failed (Windows: from its own address). */
  static hostUnreachable(packet: Ipv4Packet): IcmpError {
    return { kind: 'icmp', type: 'destinationUnreachable', code: 'host', original: PduLayers.quote(packet) }
  }

  /** RST for a segment to a closed port (RFC 793 reset generation); never in answer to a reset. */
  reset(ctx: DeviceContext, request: Ipv4Packet, segment: TcpSegment, causeEventId: number, flowId: string): void {
    if (segment.flags.includes('rst') || !InterfaceAddresses.isUnicastSource(request.src)) return
    const length = segment.flags.includes('syn') ? 1 : 0
    const withAck = segment.flags.includes('ack') && segment.ack !== undefined
    const flags: TcpFlag[] = withAck ? ['rst'] : ['ack', 'rst']
    const payload: TcpSegment = {
      kind: 'tcp',
      srcPort: segment.dstPort,
      dstPort: segment.srcPort,
      flags,
      ...(withAck ? { seq: segment.ack } : { seq: 0, ack: (segment.seq ?? 0) + length }),
      payload: null,
    }
    this.sender.send(ctx, { ids: ctx.newPdu(flowId), dst: request.src, src: request.dst, payload, causeEventId }, [
      L3Notes.of('tcpReset', { port: segment.dstPort }),
    ])
  }

  private mayReport(ctx: DeviceContext, cause: ErrorCause): boolean {
    const { packet } = cause
    const payload = packet.payload
    if (payload.kind === 'icmp' && payload.type !== 'echoRequest' && payload.type !== 'echoReply') return false
    if (cause.linkBroadcast || !InterfaceAddresses.isUnicastSource(packet.src)) return false
    if (InterfaceAddresses.isGroupAddress(packet.dst)) return false
    const ingress = cause.ingressInterfaceId === undefined ? undefined : L3Interfaces.find(ctx.device, cause.ingressInterfaceId)
    return !InterfaceAddresses.isBroadcastFor(ingress, packet.dst)
  }

  private static returnPath(via: ReturnPath | undefined): { egressInterfaceId?: string; linkDestination?: LinkDestination } {
    if (!via) return {}
    return via.linkDestination === undefined ? { egressInterfaceId: via.egressInterfaceId } : { ...via }
  }
}
