// Test-only: small stand-ins for the link (S1) and network (S2) layers so the services layer can be tested
// alone (docs/SIMULATION.md §11 interim agreement). Ethernet without real ARP (next-hop MACs are looked up
// in the configuration), hubs, connected + static routes, a host gateway, UDP / TCP demux with ICMP port
// unreachable / RST, the cloud answering on every public address. Not a reference for S1 / S2.
import { DeviceAddresses } from '../../net/DeviceAddresses'
import { Ipv4 } from '../../net/Ipv4'
import { type L3Interface, L3Interfaces } from '../../net/L3Interfaces'
import { FrameEncoder } from '../pcap/FrameEncoder'
import {
  BROADCAST_MAC,
  type DeviceContext,
  DeviceProfiles,
  type EventBuilder,
  type FrameArrival,
  type IcmpError,
  type Ipv4Delivery,
  type Ipv4Packet,
  type Ipv4Send,
  type Ipv4SendResult,
  LIMITED_BROADCAST_IP,
  type LinkLayer,
  type LinkSend,
  type NetworkLayer,
  PduLayers,
  PingTally,
  type SimLayers,
  SIM_TTL,
  type SimNote,
  type SimReason,
  type Undeliverable,
} from '../contract'
import { serviceLayer } from './index'
import type { NotedIpv4Send } from './ServiceSender'

/** Builders of packets a router forwards (the stub link layer concludes them 'forwarded'). */
const forwarding = new WeakSet<EventBuilder>()

type Route = { ok: true; interfaceId: string; portId: string; nextHopIp: string; src: string } | { ok: false; reason: SimReason }

class StubLinkLayer implements LinkLayer {
  onStart(): void {}
  onChange(): void {}
  onTimer(): void {}

  onFrame(ctx: DeviceContext, arrival: FrameArrival): void {
    const event = ctx.arrival
    if (!event) throw new Error('arrival without builder')
    if (DeviceProfiles.of(ctx.device).repeater) {
      for (const port of ctx.device.ports) if (port.id !== arrival.portId) event.transmit({ portId: port.id }, arrival.frame)
      return event.conclude('flooded', 1)
    }
    const frame = arrival.frame
    if (frame.kind !== 'ethernet' || frame.payload.kind !== 'ipv4') return event.conclude('dropped', 2, 'unsupported')
    const mac = ctx.device.ports.find((port) => port.id === arrival.portId)?.mac
    const broadcast = frame.dst === BROADCAST_MAC
    if (!broadcast && frame.dst !== mac) return event.conclude('dropped', 2, 'notForThisInterface')
    const iface = L3Interfaces.of(ctx.device).find((candidate) => candidate.portId === arrival.portId && candidate.kind !== 'subInterface')
    ctx.layers.network.onPacket(ctx, {
      interfaceId: iface?.id ?? arrival.portId,
      inPortId: arrival.portId,
      packet: frame.payload,
      ids: arrival.ids,
      linkSourceMac: frame.src,
      linkBroadcast: broadcast,
      event,
    })
  }

  send(ctx: DeviceContext, request: LinkSend): void {
    const { event } = request
    const portId = L3Interfaces.find(ctx.device, request.interfaceId)?.portId ?? request.interfaceId
    const dst = this.destinationMac(ctx, portId, request)
    if (dst === null) {
      event.conclude('dropped', 2, 'arpTimeout')
      const failure: Undeliverable = { interfaceId: request.interfaceId, nextHopIp: request.nextHopIp, packet: request.packet, ids: request.ids, reason: 'arpTimeout', droppedEventId: event.id }
      ctx.layers.network.onUndeliverable(ctx, failure)
      return
    }
    const src = ctx.device.ports.find((port) => port.id === portId)?.mac ?? ctx.device.baseMac
    const forwarded = forwarding.has(event)
    event.transmit({ portId }, { kind: 'ethernet', src, dst, payload: request.packet }, forwarded ? ctx.newFrameId() : undefined)
    event.conclude(forwarded ? 'forwarded' : 'created', forwarded ? 3 : 7)
  }

  onRequest(ctx: DeviceContext, requestId: string): void {
    ctx.report(requestId, { kind: 'cleared', entries: 0 }, true)
  }

  interfaceReady(): Ipv4SendResult {
    return { ok: true, src: '', interfaceId: '' }
  }

  /** "ARP" from the configuration: the owner of the next hop, else the cloud at the far end. */
  private destinationMac(ctx: DeviceContext, portId: string, request: LinkSend): string | null {
    const destination = request.linkDestination
    if (destination?.kind === 'broadcast') return BROADCAST_MAC
    if (destination?.kind === 'mac') return destination.mac
    for (const device of ctx.network.devices) {
      const iface = L3Interfaces.of(device).find((candidate) => candidate.address === request.nextHopIp)
      const mac = iface ? device.ports.find((port) => port.id === iface.portId)?.mac : undefined
      if (mac && device.powered) return mac
    }
    const link = ctx.topology.linksAt(ctx.device.id, portId)[0]
    const far = link ? ctx.topology.farEnd(link, ctx.device.id, portId) : undefined
    if (far?.device?.kind === 'internet' && Ipv4.isPublic(request.nextHopIp)) return far.port?.mac ?? null
    return null
  }
}

class StubNetworkLayer implements NetworkLayer {
  onStart(): void {}
  onChange(): void {}
  onTimer(): void {}

  onRequest(ctx: DeviceContext, requestId: string): void {
    ctx.report(requestId, PingTally.of([]), true)
  }

  send(ctx: DeviceContext, request: Ipv4Send): Ipv4SendResult {
    const event = ctx.openEvent({ flowId: request.ids.flowId, ids: request.ids, ...(request.causeEventId === undefined ? {} : { causeEventId: request.causeEventId }) })
    for (const note of StubNetworkLayer.notesOf(request)) event.note(note.layer, note.direction, note.message)
    const route = this.route(ctx, request.dst, request.egressInterfaceId)
    if (!route.ok) {
      event.conclude('dropped', 3, route.reason)
      return route
    }
    const router = DeviceProfiles.of(ctx.device).ipRole === 'router'
    const packet: Ipv4Packet = {
      kind: 'ipv4',
      src: request.src ?? route.src,
      dst: request.dst,
      ttl: request.ttl ?? (router ? SIM_TTL.router : SIM_TTL.host),
      identification: 0,
      payload: request.payload,
    }
    event.setOutbound(packet)
    ctx.layers.link.send(ctx, {
      interfaceId: route.interfaceId,
      nextHopIp: route.nextHopIp,
      packet,
      ids: request.ids,
      event,
      ...(request.linkDestination === undefined ? {} : { linkDestination: request.linkDestination }),
    })
    return { ok: true, src: packet.src, interfaceId: route.interfaceId }
  }

  onPacket(ctx: DeviceContext, delivery: Ipv4Delivery): void {
    const { packet, event } = delivery
    const isp = DeviceProfiles.of(ctx.device).isp
    const local = packet.dst === LIMITED_BROADCAST_IP || DeviceAddresses.has(ctx.device, packet.dst) || (isp && Ipv4.isPublic(packet.dst))
    if (local) return this.deliver(ctx, delivery)
    if (DeviceProfiles.of(ctx.device).ipRole !== 'router') return event.conclude('dropped', 3, 'notRouting')
    const route = this.route(ctx, packet.dst)
    if (!route.ok) {
      event.conclude('dropped', 3, 'noRoute')
      this.icmpError(ctx, packet, delivery, { kind: 'icmp', type: 'destinationUnreachable', code: 'host', original: PduLayers.quote(packet, FrameEncoder.ipv4Length(packet)) })
      return
    }
    forwarding.add(event)
    ctx.layers.link.send(ctx, { interfaceId: route.interfaceId, nextHopIp: route.nextHopIp, packet: { ...packet, ttl: packet.ttl - 1 }, ids: delivery.ids, event })
  }

  onUndeliverable(ctx: DeviceContext, failure: Undeliverable): void {
    const { packet } = failure
    if (!DeviceAddresses.has(ctx.device, packet.src) || packet.payload.kind === 'icmp') return
    const event = ctx.openEvent({ flowId: failure.ids.flowId, causeEventId: failure.droppedEventId })
    const error: IcmpError = { kind: 'icmp', type: 'destinationUnreachable', code: 'host', original: PduLayers.quote(packet, FrameEncoder.ipv4Length(packet)) }
    ctx.layers.services.onIcmpError(ctx, { reporterIp: packet.src, error, local: true, event })
  }

  private deliver(ctx: DeviceContext, delivery: Ipv4Delivery): void {
    const { packet, event } = delivery
    const { payload } = packet
    if (payload.kind === 'icmp') {
      if (payload.type === 'destinationUnreachable' || payload.type === 'timeExceeded') {
        return ctx.layers.services.onIcmpError(ctx, { reporterIp: packet.src, error: payload, local: false, event })
      }
      return event.conclude('dropped', 3, 'unsupported')
    }
    if (payload.kind !== 'udp' && payload.kind !== 'tcp') return event.conclude('dropped', 3, 'protocolUnreachable')
    if (ctx.layers.services.listens(ctx, payload.kind, packet.dst, payload.dstPort)) {
      return ctx.layers.services.onDatagram(ctx, { interfaceId: delivery.interfaceId, packet, ids: delivery.ids, linkSourceMac: delivery.linkSourceMac, event })
    }
    event.conclude('dropped', 4, 'portUnreachable')
    if (packet.dst === LIMITED_BROADCAST_IP || DeviceProfiles.of(ctx.device).isp) return
    if (payload.kind === 'udp') {
      this.icmpError(ctx, packet, delivery, { kind: 'icmp', type: 'destinationUnreachable', code: 'port', original: PduLayers.quote(packet, FrameEncoder.ipv4Length(packet)) })
      return
    }
    const rst = { kind: 'tcp', srcPort: payload.dstPort, dstPort: payload.srcPort, flags: ['ack', 'rst'], seq: 0, ack: (payload.seq ?? 0) + 1, payload: null } as const
    this.send(ctx, { ids: ctx.newPdu(delivery.ids.flowId), dst: packet.src, src: packet.dst, payload: rst, causeEventId: event.id })
  }

  private icmpError(ctx: DeviceContext, packet: Ipv4Packet, delivery: Ipv4Delivery, error: IcmpError): void {
    if (packet.payload.kind === 'icmp' || packet.src === '0.0.0.0') return
    const own = L3Interfaces.find(ctx.device, delivery.interfaceId)?.address
    this.send(ctx, { ids: ctx.newPdu(delivery.ids.flowId), dst: packet.src, ...(own ? { src: own } : {}), payload: error, causeEventId: delivery.event.id })
  }

  /** Egress interface, next hop and source address for `dst`. */
  private route(ctx: DeviceContext, dst: string, egressInterfaceId?: string): Route {
    const device = ctx.device
    const addressed = L3Interfaces.of(device).filter((iface) => L3Interfaces.isAddressed(iface) && iface.adminUp)
    const via = (iface: L3Interface, nextHopIp: string): Route => ({ ok: true, interfaceId: iface.id, portId: iface.portId ?? iface.id, nextHopIp, src: iface.address })
    if (egressInterfaceId !== undefined) {
      const iface = L3Interfaces.find(device, egressInterfaceId)
      return { ok: true, interfaceId: egressInterfaceId, portId: iface?.portId ?? egressInterfaceId, nextHopIp: dst, src: iface?.address ?? '' }
    }
    if (DeviceProfiles.of(device).ipRole === 'host' && device.host) {
      const nic = addressed[0]
      if (!nic) return { ok: false, reason: 'noIpAddress' }
      if (!Ipv4.isHostAddress(nic.address, nic.mask)) return { ok: false, reason: 'invalidHostAddress' }
    }
    const direct = addressed.find((iface) => Ipv4.sameSubnet(iface.address, dst, iface.mask))
    if (direct) return via(direct, dst)
    if (DeviceProfiles.of(device).ipRole === 'router') {
      const routes = [...(device.routing?.staticRoutes ?? [])]
        .filter((route) => Ipv4.inNetwork(dst, route.prefix, route.mask))
        .sort((first, second) => (Ipv4.prefixLength(second.mask) ?? 0) - (Ipv4.prefixLength(first.mask) ?? 0))
      for (const route of routes) {
        const nextHop = route.nextHop
        const exit = route.exitInterfaceId === undefined ? undefined : L3Interfaces.find(device, route.exitInterfaceId)
        if (exit) return { ok: true, interfaceId: exit.id, portId: exit.portId ?? exit.id, nextHopIp: nextHop ?? dst, src: addressed[0]?.address ?? '' }
        const toward = nextHop === undefined ? undefined : addressed.find((iface) => Ipv4.sameSubnet(iface.address, nextHop, iface.mask))
        if (toward && nextHop !== undefined) return via(toward, nextHop)
      }
      return { ok: false, reason: 'noRoute' }
    }
    const gateway = device.host?.defaultGateway ?? ''
    if (gateway === '') return { ok: false, reason: 'gatewayNotSet' }
    const toward = addressed.find((iface) => Ipv4.sameSubnet(iface.address, gateway, iface.mask))
    return toward ? via(toward, gateway) : { ok: false, reason: 'gatewayOutsideSubnet' }
  }

  private static isNoted(request: Ipv4Send): request is NotedIpv4Send {
    return 'notes' in request
  }

  /** Notes the services layer hands over with the packet (proposed `Ipv4Send.notes`). */
  private static notesOf(request: Ipv4Send): readonly SimNote[] {
    return StubNetworkLayer.isNoted(request) ? request.notes : []
  }
}

/** The services layer under test over the stub link / network layers. */
export const serviceTestLayers: SimLayers = { link: new StubLinkLayer(), network: new StubNetworkLayer(), services: serviceLayer }
