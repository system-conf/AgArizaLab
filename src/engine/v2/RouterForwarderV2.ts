import type { DeviceV2, NetworkStateV2 } from '../../domain/v2'
import { Ipv4 } from '../Ipv4'
import { type L3Interface, L3Interfaces } from './L3Interfaces'
import { type Journey, type ReachTraceV2, ReachTraces, type RouterHop } from './ReachTraceV2'
import { RoutingTableV2, type RouteV2 } from './RoutingTableV2'
import type { SegmentFinderV2 } from './SegmentFinderV2'
import { TopologyV2 } from './TopologyV2'

/** Can `fromDeviceId` send to `toIp` (no further reply check)? Used for the way back. */
export type ReplyCheck = (state: NetworkStateV2, fromDeviceId: string, toIp: string) => boolean

/** A packet handed to a router: where it is, how it got there and where replies go. */
export interface Forwarding {
  routerId: string
  toIp: string
  journey: Journey
  /** Address replies must reach; null = no reply check (the sender has no address on the way). */
  replyTo: string | null
  /** TTL the packet left its sender with (Windows 128, IOS 255). */
  initialTtl: number
}

/** The internet service behind an exit interface (MODEL_V2 §5). */
interface WanService {
  cloudId: string
  serviceUp: boolean
}

/**
 * Hop-by-hop forwarding through routers (MODEL_V2 §13, §5): own addresses, routing table, the WAN
 * rule for routed ports cabled to the cloud, next-hop ARP in the exit segment, loop detection
 * (`ttlExpired`) and the reply check at the destination.
 */
export class RouterForwarderV2 {
  private readonly segments: SegmentFinderV2
  private readonly replyCheck: ReplyCheck

  constructor(segments: SegmentFinderV2, replyCheck: ReplyCheck) {
    this.segments = segments
    this.replyCheck = replyCheck
  }

  forward(state: NetworkStateV2, forwarding: Forwarding): ReachTraceV2 {
    const topology = TopologyV2.of(state)
    const { toIp, replyTo } = forwarding
    const journey: Journey = { ...forwarding.journey, reached: [...forwarding.journey.reached], routerHops: [...forwarding.journey.routerHops] }
    let router = topology.require(forwarding.routerId)

    for (;;) {
      if (RoutingTableV2.ownsAddress(topology, router, toIp)) return this.delivered(state, router.id, journey, replyTo)
      const route = RoutingTableV2.lookup(topology, router, toIp)
      if (!route) return ReachTraces.failure(Ipv4.isPublic(toIp) ? 'wanDown' : 'noRouteToDestination', router.id, journey)

      const wan = this.wanService(topology, route.exit)
      if (wan) return this.toInternet(router, toIp, wan, journey)

      const hop = this.nextHop(state, router, route, toIp, journey)
      if (hop.kind === 'dropped') return hop.trace
      if (hop.kind === 'destination') return this.delivered(state, hop.iface.deviceId, journey, replyTo)
      // Forwarding is decided per router, so a hop seen before (same router, same ingress) repeats forever.
      const next: RouterHop = { deviceId: hop.iface.deviceId, ip: hop.iface.address }
      const loopStart = journey.routerHops.findIndex((seen) => seen.deviceId === next.deviceId && seen.ip === next.ip)
      if (loopStart >= 0) return this.looped(journey, loopStart, forwarding.initialTtl)
      journey.routerHops.push(next)
      router = topology.require(next.deviceId)
    }
  }

  private nextHop(
    state: NetworkStateV2,
    router: DeviceV2,
    route: RouteV2,
    toIp: string,
    journey: Journey,
  ): { kind: 'router' | 'destination'; iface: L3Interface } | { kind: 'dropped'; trace: ReachTraceV2 } {
    const segment = this.segments.segment(state, route.exit)
    const target = this.segments.findAddress(state, segment, route.nextHop ?? toIp)
    if (!target) return { kind: 'dropped', trace: ReachTraces.failure('destinationNotInSegment', router.id, journey) }
    journey.reached.push(...this.segments.pathTo(segment, target).slice(1))
    if (route.nextHop === null) return { kind: 'destination', iface: target }

    const nextRouter = TopologyV2.of(state).find(target.deviceId)
    if (!L3Interfaces.isNetworkSide(target) || !nextRouter || !L3Interfaces.isRouter(nextRouter)) {
      // The next hop is not a router: it silently drops packets that are not for itself.
      return { kind: 'dropped', trace: ReachTraces.failure('gatewayUnreachable', router.id, journey) }
    }
    return { kind: 'router', iface: target }
  }

  /** Directly connected destination or own address: done, if the reply finds its way back. */
  private delivered(state: NetworkStateV2, deviceId: string, journey: Journey, replyTo: string | null): ReachTraceV2 {
    if (replyTo === null || this.replyCheck(state, deviceId, replyTo)) return ReachTraces.success(journey)
    // The request arrived; only the reply has no way back.
    return ReachTraces.failure('gatewayUnreachable', deviceId, journey)
  }

  /** Only public destinations are served by the provider; the line must be up. */
  private toInternet(router: DeviceV2, toIp: string, wan: WanService, journey: Journey): ReachTraceV2 {
    if (!Ipv4.isPublic(toIp)) return ReachTraces.failure('noRouteToDestination', router.id, journey)
    if (!wan.serviceUp) return ReachTraces.failure('wanDown', router.id, journey)
    return ReachTraces.success({ ...journey, reached: [...journey.reached, wan.cloudId] })
  }

  /**
   * A routing loop: the hops from `loopStart` on repeat forever. The n-th router (0-based) receives
   * the packet with TTL `initialTtl - n`, so the TTL runs out at hop `initialTtl - 1`.
   */
  private looped(journey: Journey, loopStart: number, initialTtl: number): ReachTraceV2 {
    const expired = ReachTraces.hopAt({ routerHops: journey.routerHops, loopStart }, initialTtl - 1)
    return {
      ...ReachTraces.failure('ttlExpired', expired?.deviceId ?? journey.reached[0] ?? '', journey),
      loopStart,
      expiredAtIp: expired?.ip ?? '',
    }
  }

  private wanService(topology: TopologyV2, exit: L3Interface): WanService | null {
    if (exit.kind !== 'routed' || exit.portId === undefined) return null
    for (const link of topology.linksAt(exit.deviceId, exit.portId)) {
      if (!topology.isUp(link)) continue
      const far = topology.farEnd(link, exit.deviceId, exit.portId)
      if (far.device?.kind !== 'internet' || far.port?.role !== 'passive') continue
      const handoff = far.device.internet?.handoffs.find((candidate) => candidate.portId === far.port?.id)
      return { cloudId: far.device.id, serviceUp: handoff?.serviceUp ?? true }
    }
    return null
  }
}
