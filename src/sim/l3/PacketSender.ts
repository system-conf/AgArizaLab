import type { LocalizedMessage } from '../../domain/Messages'
import { HostAttachment } from '../../net/HostAttachment'
import { Ipv4 } from '../../net/Ipv4'
import { type L3Interface, L3Interfaces } from '../../net/L3Interfaces'
import { InterfaceStatus } from '../../net/InterfaceStatus'
import {
  type DeviceContext,
  DeviceProfiles,
  type Ipv4Delivery,
  type Ipv4Packet,
  type Ipv4Send,
  type Ipv4SendResult,
  LIMITED_BROADCAST_IP,
  type LinkDestination,
  SIM_TTL,
  type SimReason,
  UNSPECIFIED_IP,
} from '../contract'
import { InterfaceAddresses } from './InterfaceAddresses'
import { L3Notes } from './L3Notes'
import { NetworkRuntimes } from './NetworkRuntimes'
import { RouteLookup } from './RouteLookup'

/** Delivery of a packet this device sent to itself (own address, loopback). */
export interface LocalStack {
  deliverLocal(ctx: DeviceContext, delivery: Ipv4Delivery): void
}

/** What happens to an originated packet. */
type SendPlan =
  | { readonly kind: 'refused'; readonly reason: SimReason; readonly src: string; readonly note: LocalizedMessage }
  | { readonly kind: 'local'; readonly interfaceId: string; readonly src: string; readonly note: LocalizedMessage }
  | {
      readonly kind: 'link'
      readonly interfaceId: string
      readonly nextHopIp: string
      readonly src: string
      readonly linkDestination?: LinkDestination
      readonly notes: readonly LocalizedMessage[]
    }

const BROADCAST: LinkDestination = { kind: 'broadcast' }

/**
 * Originates IPv4 packets (docs/SIMULATION.md §7.2): hosts check in the rule engine's order (source
 * interface, address, conflict, destination, own address, subnet, gateway); routers look up their
 * table and never send private destinations to the cloud; the cloud answers only on the arrival port.
 * Every packet gets a 'created' event; a refused one is concluded 'dropped' here, a sent one by the link layer.
 */
export class PacketSender {
  private readonly local: LocalStack

  constructor(local: LocalStack) {
    this.local = local
  }

  send(ctx: DeviceContext, request: Ipv4Send, notes: readonly LocalizedMessage[] = []): Ipv4SendResult {
    const event = ctx.openEvent({
      flowId: request.ids.flowId,
      ids: request.ids,
      ...(request.causeEventId === undefined ? {} : { causeEventId: request.causeEventId }),
    })
    for (const note of request.notes ?? []) event.note(note.layer, 'out', note.message)
    for (const note of notes) event.note(3, 'out', note)
    const plan = this.plan(ctx, request)
    const packet = this.packet(ctx, request, plan.src)
    switch (plan.kind) {
      case 'refused':
        event.note(3, 'out', plan.note)
        event.setOutbound(packet)
        event.conclude('dropped', 3, plan.reason)
        return { ok: false, reason: plan.reason }
      case 'local':
        event.note(3, 'out', plan.note)
        event.setOutbound(packet)
        event.conclude('created', 3)
        this.local.deliverLocal(ctx, { interfaceId: plan.interfaceId, inPortId: '', packet, ids: request.ids, linkSourceMac: null, linkBroadcast: false, event })
        return { ok: true, src: plan.src, interfaceId: plan.interfaceId }
      case 'link':
        for (const note of plan.notes) event.note(3, 'out', note)
        ctx.layers.link.send(ctx, {
          interfaceId: plan.interfaceId,
          nextHopIp: plan.nextHopIp,
          packet,
          ids: request.ids,
          event,
          ...(plan.linkDestination === undefined ? {} : { linkDestination: plan.linkDestination }),
        })
        return { ok: true, src: plan.src, interfaceId: plan.interfaceId }
    }
  }

  private packet(ctx: DeviceContext, request: Ipv4Send, src: string): Ipv4Packet {
    const profile = DeviceProfiles.of(ctx.device)
    const defaultTtl = profile.isp ? SIM_TTL.internetReply : profile.ipRole === 'router' ? SIM_TTL.router : SIM_TTL.host
    const identification = NetworkRuntimes.takeIdentification(ctx)
    return { kind: 'ipv4', src, dst: request.dst, ttl: request.ttl ?? defaultTtl, identification, payload: request.payload }
  }

  private plan(ctx: DeviceContext, request: Ipv4Send): SendPlan {
    const profile = DeviceProfiles.of(ctx.device)
    if (request.egressInterfaceId !== undefined) return this.onInterface(ctx, request, request.egressInterfaceId)
    if (profile.isp) return refused('ispNoRoute', request.src ?? UNSPECIFIED_IP, L3Notes.of('ispNoRoute', { dst: request.dst }))
    if (profile.ipRole === 'router') return this.fromRouter(ctx, request)
    if (profile.ipRole === 'host') return this.fromHost(ctx, request)
    return refused('unsupported', request.src ?? UNSPECIFIED_IP, L3Notes.of('noUsableAddress'))
  }

  /** DHCP and the cloud: a given interface, no routing lookup. */
  private onInterface(ctx: DeviceContext, request: Ipv4Send, interfaceId: string): SendPlan {
    const iface = L3Interfaces.find(ctx.device, interfaceId)
    const src = request.src ?? (iface && iface.address !== '' ? iface.address : UNSPECIFIED_IP)
    const failure = iface ? PacketSender.linkFailure(ctx, iface) : null
    if (failure) return refused(failure, src, L3Notes.of(failure))
    const linkDestination = request.linkDestination ?? (request.dst === LIMITED_BROADCAST_IP ? BROADCAST : undefined)
    const notes = [L3Notes.of('sendOnInterface', { iface: interfaceId })]
    return { kind: 'link', interfaceId, nextHopIp: request.dst, src, notes, ...(linkDestination ? { linkDestination } : {}) }
  }

  /** Why an interface cannot send at layer 1 (a NIC names the first problem like the rule engine). */
  private static linkFailure(ctx: DeviceContext, iface: L3Interface): 'cableDisconnected' | 'portDisabled' | null {
    if (iface.kind === 'nic') {
      const attachment = HostAttachment.attach(ctx.topology, iface)
      return attachment.ok ? null : attachment.reason
    }
    return InterfaceStatus.isUp(ctx.topology, iface) ? null : 'cableDisconnected'
  }

  /** The rule engine's order (ReachabilityChecker.run / prepare / reachThroughGateway). */
  private fromHost(ctx: DeviceContext, request: Ipv4Send): SendPlan {
    const { dst } = request
    if (Ipv4.isLoopback(dst)) return { kind: 'local', interfaceId: 'loopback', src: dst, note: L3Notes.of('loopback', { dst }) }
    const selection = HostAttachment.select(ctx.topology, ctx.device, dst)
    if (!selection.ok) return refused(selection.reason, UNSPECIFIED_IP, L3Notes.of(selection.reason))
    const { iface, gateway } = selection
    const own = iface.address
    if (own === '') return refused('noIpAddress', UNSPECIFIED_IP, L3Notes.of('noUsableAddress'))
    if (!Ipv4.isValid(own) || !Ipv4.isValidMask(iface.mask)) return refused('invalidConfig', UNSPECIFIED_IP, L3Notes.of('invalidConfig', { iface: iface.id }))
    if (!Ipv4.isHostAddress(own, iface.mask)) return refused('invalidHostAddress', own, L3Notes.of('invalidHostAddress', { ip: own }))
    const ready = ctx.layers.link.interfaceReady(ctx, iface.id)
    if (!ready.ok) return refused(ready.reason, own, ready.reason === 'ipConflict' ? L3Notes.of('ipConflict', { ip: own }) : L3Notes.of('noUsableAddress'))
    const src = request.src ?? own
    if (!Ipv4.isValid(dst)) return refused('invalidConfig', src, L3Notes.of('invalidDestination', { dst }))
    const owner = InterfaceAddresses.owner(ctx.topology, ctx.device, dst, false)
    if (owner) return { kind: 'local', interfaceId: owner.id, src: dst, note: L3Notes.of('loopback', { dst }) }
    if (dst === LIMITED_BROADCAST_IP || InterfaceAddresses.directedBroadcast(iface) === dst) {
      return { kind: 'link', interfaceId: iface.id, nextHopIp: dst, src, linkDestination: BROADCAST, notes: [L3Notes.of('localNetwork', { dst })] }
    }
    if (Ipv4.sameSubnet(own, dst, iface.mask)) {
      return { kind: 'link', interfaceId: iface.id, nextHopIp: dst, src, notes: [L3Notes.of('localNetwork', { dst })] }
    }
    if (gateway === '') return refused('gatewayNotSet', src, L3Notes.of('gatewayNotSet', { dst }))
    if (!Ipv4.isValid(gateway)) return refused('invalidConfig', src, L3Notes.of('invalidConfig', { iface: iface.id }))
    if (!Ipv4.sameSubnet(own, gateway, iface.mask)) return refused('gatewayOutsideSubnet', src, L3Notes.of('gatewayOutsideSubnet', { gateway }))
    return { kind: 'link', interfaceId: iface.id, nextHopIp: gateway, src, notes: [L3Notes.of('viaGateway', { dst, gateway })] }
  }

  /** A router sends from the exit interface (else its first addressed up interface). */
  private fromRouter(ctx: DeviceContext, request: Ipv4Send): SendPlan {
    const { dst } = request
    const fallbackSrc = request.src ?? InterfaceAddresses.sourceAddress(ctx.topology, ctx.device)
    if (Ipv4.isLoopback(dst)) return { kind: 'local', interfaceId: 'loopback', src: dst, note: L3Notes.of('loopback', { dst }) }
    if (!Ipv4.isValid(dst)) return refused('invalidConfig', fallbackSrc, L3Notes.of('invalidDestination', { dst }))
    const owner = InterfaceAddresses.owner(ctx.topology, ctx.device, dst, true)
    if (owner) return { kind: 'local', interfaceId: owner.id, src: dst, note: L3Notes.of('loopback', { dst }) }
    const resolved = RouteLookup.resolve(ctx.runtime.network.routes, dst)
    if (!resolved) {
      const note = Ipv4.isPublic(dst) ? L3Notes.of('noRoutePublic', { dst }) : L3Notes.of('noRoute', { dst })
      return refused('noRoute', fallbackSrc, note)
    }
    const exit = L3Interfaces.find(ctx.device, resolved.exitInterfaceId)
    const src = request.src ?? InterfaceAddresses.sourceAddress(ctx.topology, ctx.device, exit)
    if (exit && InterfaceAddresses.isCloudFacing(ctx.topology, exit) && !Ipv4.isPublic(dst)) {
      return refused('privateToInternet', src, L3Notes.of('privateToInternet', { dst }))
    }
    if (src === '') return refused('noIpAddress', UNSPECIFIED_IP, L3Notes.of('noUsableAddress'))
    const { entry } = resolved
    const routeNote =
      entry.nextHop === null
        ? L3Notes.of('connectedRoute', { dst, prefix: entry.prefix, length: entry.prefixLength, iface: resolved.exitInterfaceId })
        : L3Notes.of('routeFound', { dst, prefix: entry.prefix, length: entry.prefixLength, via: resolved.nextHopIp, iface: resolved.exitInterfaceId })
    return { kind: 'link', interfaceId: resolved.exitInterfaceId, nextHopIp: resolved.nextHopIp, src, notes: [routeNote] }
  }
}

function refused(reason: SimReason, src: string, note: LocalizedMessage): SendPlan {
  return { kind: 'refused', reason, src, note }
}
