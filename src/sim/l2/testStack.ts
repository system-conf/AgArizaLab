// Test-only: a minimal network layer on top of the real link layer, so link-layer tests can ping.
// Hosts answer echoes to their own addresses; devices with ip routing forward to a connected subnet
// (no route table, no ICMP errors). Results: the echo reply, or 'unreachable' when ARP failed.
import type { NetworkState } from '../../domain'
import { Ipv4 } from '../../engine/Ipv4'
import { type L3Interface, L3Interfaces } from '../../engine/L3Interfaces'
import { SimulationKernel } from '../core/SimulationKernel'
import { nullLayers } from '../core/NullLayers'
import {
  type DeviceContext,
  DeviceProfiles,
  type Ipv4Delivery,
  type Ipv4Send,
  type Ipv4SendResult,
  type NetworkLayer,
  type SimEvent,
  type SimLayers,
  type SimOptions,
  type SimRequest,
  type Undeliverable,
  UNSPECIFIED_IP,
} from '../contract'
import { linkLayer } from './index'

function holding(device: DeviceContext['device'], ip: string): L3Interface | undefined {
  return L3Interfaces.of(device).find((iface) => L3Interfaces.isAddressed(iface) && Ipv4.sameSubnet(iface.address, ip, iface.mask))
}

/** An interface whose port is cabled to the internet cloud (stands in for a default route). */
function wanInterface(ctx: DeviceContext): L3Interface | undefined {
  return L3Interfaces.of(ctx.device).find((iface) => {
    if (iface.portId === undefined) return false
    return ctx.topology.linksAt(ctx.device.id, iface.portId).some((link) => ctx.topology.farEnd(link, ctx.device.id, iface.portId ?? '').device?.kind === 'internet')
  })
}

class StubNetworkLayer implements NetworkLayer {
  onStart(): void {}
  onChange(): void {}
  onTimer(): void {}

  onPacket(ctx: DeviceContext, delivery: Ipv4Delivery): void {
    const { packet, event } = delivery
    const payload = packet.payload
    if (DeviceProfiles.of(ctx.device).isp) return this.cloudReply(ctx, delivery)
    if (L3Interfaces.of(ctx.device).some((iface) => iface.address === packet.dst)) {
      if (payload.kind === 'icmp' && payload.type === 'echoRequest') {
        event.conclude('replied', 3)
        this.send(ctx, { ids: ctx.newPdu(event.flowId), dst: packet.src, payload: { ...payload, type: 'echoReply' }, causeEventId: event.id })
        return
      }
      event.conclude('delivered', 3)
      if (payload.kind === 'icmp' && payload.type === 'echoReply' && event.flowId.startsWith('r')) {
        const echo = { kind: 'reply', sequence: payload.sequence, requestPduId: 'stub', fromIp: packet.src, ttl: packet.ttl, bytes: payload.dataBytes, rttMs: 0 } as const
        ctx.report(event.flowId, { kind: 'ping', echoes: [echo] }, true)
      }
      return
    }
    const exit = holding(ctx.device, packet.dst)
    if (DeviceProfiles.of(ctx.device).ipRole !== 'router' || !exit) return event.conclude('dropped', 3, 'notRouting')
    ctx.layers.link.send(ctx, {
      interfaceId: exit.id,
      nextHopIp: packet.dst,
      packet: { ...packet, ttl: packet.ttl - 1 },
      ids: delivery.ids,
      event,
      ingressInterfaceId: delivery.interfaceId,
    })
  }

  send(ctx: DeviceContext, request: Ipv4Send): Ipv4SendResult {
    const gateway = ctx.device.host?.defaultGateway ?? ''
    const wan = wanInterface(ctx)
    const direct = holding(ctx.device, request.dst) ?? (holding(ctx.device, gateway) ? undefined : wan)
    const iface = request.egressInterfaceId === undefined ? (direct ?? holding(ctx.device, gateway)) : L3Interfaces.find(ctx.device, request.egressInterfaceId)
    const event = ctx.openEvent({ flowId: request.ids.flowId, ids: request.ids, ...(request.causeEventId === undefined ? {} : { causeEventId: request.causeEventId }) })
    const ready = iface ? ctx.layers.link.interfaceReady(ctx, iface.id) : ({ ok: false, reason: 'noRoute' } as const)
    if (!iface || !ready.ok) {
      const reason = ready.ok ? 'noRoute' : ready.reason
      event.conclude('dropped', 3, reason)
      return { ok: false, reason }
    }
    const firstAddressed = L3Interfaces.of(ctx.device).find((candidate) => L3Interfaces.isAddressed(candidate))?.address
    const src = request.src ?? (ready.src === UNSPECIFIED_IP ? (firstAddressed ?? ready.src) : ready.src)
    const packet = { kind: 'ipv4', src, dst: request.dst, ttl: request.ttl ?? 128, identification: 1, payload: request.payload } as const
    ctx.layers.link.send(ctx, {
      interfaceId: iface.id,
      nextHopIp: direct ? request.dst : gateway,
      packet,
      ids: request.ids,
      event,
      ...(request.linkDestination === undefined ? {} : { linkDestination: request.linkDestination }),
    })
    return { ok: true, src: packet.src, interfaceId: iface.id }
  }

  /** The internet answers echoes to public addresses, back to the MAC the request came from. */
  private cloudReply(ctx: DeviceContext, delivery: Ipv4Delivery): void {
    const { packet, event, linkSourceMac } = delivery
    const payload = packet.payload
    if (!Ipv4.isPublic(packet.dst) || payload.kind !== 'icmp' || payload.type !== 'echoRequest' || linkSourceMac === null) {
      return event.conclude('dropped', 3, 'ispNoRoute')
    }
    event.conclude('replied', 3)
    const ids = ctx.newPdu(event.flowId)
    const reply = { kind: 'ipv4', src: packet.dst, dst: packet.src, ttl: 118, identification: 1, payload: { ...payload, type: 'echoReply' } } as const
    const created = ctx.openEvent({ flowId: ids.flowId, ids, causeEventId: event.id })
    ctx.layers.link.send(ctx, { interfaceId: delivery.interfaceId, nextHopIp: packet.src, packet: reply, ids, event: created, linkDestination: { kind: 'mac', mac: linkSourceMac } })
  }

  onUndeliverable(ctx: DeviceContext, failure: Undeliverable): void {
    if (!failure.ids.flowId.startsWith('r') || failure.ingressInterfaceId !== undefined) return
    const echo = { kind: 'unreachable', sequence: 1, requestPduId: failure.ids.pduId, fromIp: failure.packet.src, code: 'host' } as const
    ctx.report(failure.ids.flowId, { kind: 'ping', echoes: [echo] }, true)
  }

  onRequest(ctx: DeviceContext, requestId: string, request: SimRequest): void {
    if (request.kind !== 'ping') return ctx.report(requestId, { kind: 'cleared', entries: 0 }, true)
    const payload = { kind: 'icmp', type: 'echoRequest', identifier: 1, sequence: 1, dataBytes: request.size } as const
    const result = this.send(ctx, { ids: ctx.newPdu(requestId), dst: request.targetIp, payload })
    if (!result.ok) ctx.report(requestId, { kind: 'ping', echoes: [{ kind: 'localFailure', sequence: 1, reason: result.reason }] }, true)
  }
}

export const linkTestLayers: SimLayers = { ...nullLayers, link: linkLayer, network: new StubNetworkLayer() }

export function startLab(network: NetworkState, options: SimOptions = {}): SimulationKernel {
  return SimulationKernel.create(network, linkTestLayers, options)
}

export function pingRequest(deviceId: string, targetIp: string): SimRequest {
  return { kind: 'ping', deviceId, targetIp, count: 1, size: 32 }
}

/** `[deviceId, action]` rows (plus the reason of drops) of some events. */
export function actions(events: readonly SimEvent[]): string[] {
  return events.map((event) => `${event.deviceId} ${event.action}${event.reason === undefined ? '' : ` ${event.reason}`}`)
}

/** Translation keys of an event's notes (the last path segment). */
export function noteKeys(event: SimEvent | undefined): string[] {
  return (event?.notes ?? []).map((note) => note.message.key.split('.').pop() ?? '')
}
