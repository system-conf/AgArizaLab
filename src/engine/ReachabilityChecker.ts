import type { Device, NetworkState, ReachResult } from '../domain'
import { Ipv4 } from './Ipv4'
import { HostAttachment } from './HostAttachment'
import { type L3Interface, L3Interfaces } from './L3Interfaces'
import { type ReachTrace, ReachTraces } from './ReachTrace'
import { RouterForwarder } from './RouterForwarder'
import { RoutingTable } from './RoutingTable'
import type { Segment, SegmentFinder } from './SegmentFinder'
import { Topology } from './Topology'

/** Windows sends echo requests with TTL 128, IOS with 255. */
const HOST_TTL = 128
const ROUTER_TTL = 255

/** A sender that passed the local checks (power, link, address). */
interface ReadySource {
  device: Device
  iface: L3Interface
  gateway: string
  segment: Segment
}

type Prepared = { ok: true; source: ReadySource } | { ok: false; trace: ReachTrace }

/**
 * "Can this device ping that address?" on a v2 state (PLAN §4.2 order, MODEL_V2 §13 rules):
 * local checks, same-subnet delivery, the default gateway, then router-by-router forwarding.
 * Routers can be senders too (DNS forwarders, the way back).
 */
export class ReachabilityChecker {
  private readonly segments: SegmentFinder
  private readonly forwarder: RouterForwarder

  constructor(segments: SegmentFinder) {
    this.segments = segments
    this.forwarder = new RouterForwarder(segments, (state, fromDeviceId, toIp) => this.canSend(state, fromDeviceId, toIp))
  }

  /** Can the device get a packet to `toIp` (no reply check)? The way back of a reply or an ICMP error. */
  canSend(state: NetworkState, fromDeviceId: string, toIp: string): boolean {
    return this.oneWay(state, fromDeviceId, toIp).result.ok
  }

  reach(state: NetworkState, fromDeviceId: string, toIp: string): ReachResult {
    return this.trace(state, fromDeviceId, toIp).result
  }

  /** Same checks as `reach`, also returning how the packet travelled. */
  trace(state: NetworkState, fromDeviceId: string, toIp: string): ReachTrace {
    return this.run(state, fromDeviceId, toIp, true)
  }

  /** The way there only: no check that the destination can answer (used for the way back). */
  private oneWay(state: NetworkState, fromDeviceId: string, toIp: string): ReachTrace {
    return this.run(state, fromDeviceId, toIp, false)
  }

  private run(state: NetworkState, fromDeviceId: string, toIp: string, checkReply: boolean): ReachTrace {
    const topology = Topology.of(state)
    const from = topology.require(fromDeviceId)
    if (!from.powered) return ReachTraces.atSource('powerOff', from.id)
    // Loopback is answered by the device itself, even without a network link.
    if (Ipv4.isLoopback(toIp)) return ReachTraces.success({ reached: [from.id], routerHops: [], sourceIp: '' })
    if (L3Interfaces.isRouter(from) && !from.host) return this.fromRouter(state, from, toIp, checkReply)

    const prepared = this.prepare(state, from, toIp)
    if (!prepared.ok) return prepared.trace
    const { source } = prepared
    const sourceIp = source.iface.address
    if (!Ipv4.isValid(toIp)) return ReachTraces.atSource('invalidConfig', from.id, sourceIp)
    if (L3Interfaces.of(from).some((iface) => iface.address === toIp)) {
      return ReachTraces.success({ reached: [from.id], routerHops: [], sourceIp })
    }
    // A broadcast reaches everyone in the segment, and nobody answers an echo sent to one.
    if (Ipv4.isBroadcastFor(toIp, sourceIp, source.iface.mask)) {
      return { ...ReachTraces.atSource('destinationNotInSegment', from.id, sourceIp), silent: true }
    }
    if (Ipv4.sameSubnet(sourceIp, toIp, source.iface.mask)) return this.reachLocal(state, source, toIp)
    return this.reachThroughGateway(state, source, toIp, checkReply)
  }

  /**
   * Link, port and own address; failures here never leave the source. An address that is the
   * subnet's network/broadcast address, or that another device in the segment already uses
   * (duplicate address detection), is unusable like on Windows.
   */
  private prepare(state: NetworkState, from: Device, toIp: string): Prepared {
    const selection = HostAttachment.select(Topology.of(state), from, toIp)
    const notSent = { reached: [from.id], routerHops: [], sourceIp: '' }
    if (!selection.ok) return { ok: false, trace: ReachTraces.failure(selection.reason, selection.atDeviceId, notSent) }
    const { iface, gateway } = selection
    const fail = (reason: 'noIpAddress' | 'invalidConfig' | 'invalidHostAddress' | 'ipConflict'): Prepared => ({
      ok: false,
      trace: ReachTraces.failure(reason, from.id, notSent),
    })
    if (iface.address === '') return fail('noIpAddress')
    if (!Ipv4.isValid(iface.address) || !Ipv4.isValidMask(iface.mask)) return fail('invalidConfig')
    if (!Ipv4.isHostAddress(iface.address, iface.mask)) return fail('invalidHostAddress')
    const segment = this.segments.segment(state, iface)
    if (this.segments.conflictingInterface(state, segment, from.id, iface.address)) return fail('ipConflict')
    return { ok: true, source: { device: from, iface, gateway, segment } }
  }

  /** Destination in the sender's own subnet must be in its layer-2 segment. */
  private reachLocal(state: NetworkState, source: ReadySource, toIp: string): ReachTrace {
    const { device, segment, iface } = source
    const target = this.segments.findAddress(state, segment, toIp)
    if (!target) return ReachTraces.atSource('destinationNotInSegment', device.id, iface.address)
    return ReachTraces.success({ reached: this.segments.pathTo(segment, target), routerHops: [], sourceIp: iface.address })
  }

  /** The default gateway must be a routing interface inside the segment. */
  private reachThroughGateway(state: NetworkState, source: ReadySource, toIp: string, checkReply: boolean): ReachTrace {
    const { device, iface, gateway, segment } = source
    const sourceIp = iface.address
    if (gateway === '') return ReachTraces.atSource('gatewayNotSet', device.id, sourceIp)
    if (!Ipv4.isValid(gateway)) return ReachTraces.atSource('invalidConfig', device.id, sourceIp)
    if (!Ipv4.sameSubnet(sourceIp, gateway, iface.mask)) return ReachTraces.atSource('gatewayOutsideSubnet', device.id, sourceIp)

    const gatewayInterface = this.segments.findAddress(state, segment, gateway)
    const router = gatewayInterface && Topology.of(state).find(gatewayInterface.deviceId)
    if (!gatewayInterface || !router || !L3Interfaces.isNetworkSide(gatewayInterface) || !L3Interfaces.isRouter(router)) {
      return ReachTraces.atSource('gatewayUnreachable', device.id, sourceIp)
    }
    return this.forwarder.forward(state, {
      routerId: router.id,
      toIp,
      journey: {
        reached: this.segments.pathTo(segment, gatewayInterface),
        routerHops: [{ deviceId: router.id, ip: gateway }],
        sourceIp,
      },
      replyTo: checkReply ? sourceIp : null,
      initialTtl: HOST_TTL,
    })
  }

  /** A router sends from the interface its route leaves through. */
  private fromRouter(state: NetworkState, router: Device, toIp: string, checkReply: boolean): ReachTrace {
    if (!Ipv4.isValid(toIp)) return ReachTraces.atSource('invalidConfig', router.id)
    const topology = Topology.of(state)
    const exit = RoutingTable.lookup(topology, router, toIp)?.exit
    const sourceIp = exit && L3Interfaces.isAddressed(exit) ? exit.address : ''
    return this.forwarder.forward(state, {
      routerId: router.id,
      toIp,
      journey: { reached: [router.id], routerHops: [], sourceIp },
      replyTo: checkReply && sourceIp !== '' ? sourceIp : null,
      initialTtl: ROUTER_TTL,
    })
  }
}
