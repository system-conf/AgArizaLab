import type { Device, NetworkState } from '../domain'
import { Ipv4 } from './Ipv4'
import { type L3Interface, L3Interfaces } from './L3Interfaces'
import { type Journey, type ReachTrace, ReachTraces, type RouterHop } from './ReachTrace'
import { RoutingTable, type Route } from './RoutingTable'
import type { SegmentFinder } from './SegmentFinder'
import { Topology } from './Topology'

/** Can `fromDeviceId` send to `toIp` (no further reply check)? Used for the way back. */
export type ReplyCheck = (state: NetworkState, fromDeviceId: string, toIp: string) => boolean

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
 * (`ttlExpired`) and the reply check at the destination (the internet included). Directed
 * broadcasts and ICMP errors of a router without a route back to the sender end in silence.
 */
export class RouterForwarder {
  private readonly segments: SegmentFinder
  private readonly replyCheck: ReplyCheck

  constructor(segments: SegmentFinder, replyCheck: ReplyCheck) {
    this.segments = segments
    this.replyCheck = replyCheck
  }

  forward(state: NetworkState, forwarding: Forwarding): ReachTrace {
    const topology = Topology.of(state)
    const { toIp, replyTo } = forwarding
    const journey: Journey = { ...forwarding.journey, reached: [...forwarding.journey.reached], routerHops: [...forwarding.journey.routerHops] }
    let router = topology.require(forwarding.routerId)

    for (;;) {
      if (RoutingTable.ownsAddress(topology, router, toIp)) return this.delivered(state, router.id, journey, replyTo)
      const route = RoutingTable.lookup(topology, router, toIp)
      if (!route) {
        if (Ipv4.isPublic(toIp)) return ReachTraces.failure('wanDown', router.id, journey)
        return this.reported(state, ReachTraces.failure('noRouteToDestination', router.id, journey), router.id, replyTo)
      }

      const wan = this.wanService(topology, route.exit)
      if (wan) return this.toInternet(state, router, toIp, wan, journey, replyTo)
      if (route.nextHop === null && Ipv4.isBroadcastFor(toIp, route.exit.address, route.exit.mask)) {
        // A directed broadcast leaves as a link broadcast, and nobody answers an echo sent to one.
        return { ...ReachTraces.failure('destinationNotInSegment', router.id, journey), silent: true }
      }

      const hop = this.nextHop(state, router, route, toIp, journey)
      if (hop.kind === 'dropped') return this.reported(state, hop.trace, router.id, replyTo)
      if (hop.kind === 'destination') return this.delivered(state, hop.iface.deviceId, journey, replyTo)
      // Forwarding is decided per router, so a hop seen before (same router, same ingress) repeats forever.
      const next: RouterHop = { deviceId: hop.iface.deviceId, ip: hop.iface.address }
      const loopStart = journey.routerHops.findIndex((seen) => seen.deviceId === next.deviceId && seen.ip === next.ip)
      if (loopStart >= 0) return this.looped(state, journey, loopStart, forwarding)
      journey.routerHops.push(next)
      router = topology.require(next.deviceId)
    }
  }

  private nextHop(
    state: NetworkState,
    router: Device,
    route: Route,
    toIp: string,
    journey: Journey,
  ): { kind: 'router' | 'destination'; iface: L3Interface } | { kind: 'dropped'; trace: ReachTrace } {
    const segment = this.segments.segment(state, route.exit)
    const target = this.segments.findAddress(state, segment, route.nextHop ?? toIp)
    if (!target) return { kind: 'dropped', trace: ReachTraces.failure('destinationNotInSegment', router.id, journey) }
    journey.reached.push(...this.segments.pathTo(segment, target).slice(1))
    if (route.nextHop === null) return { kind: 'destination', iface: target }

    const nextRouter = Topology.of(state).find(target.deviceId)
    if (!L3Interfaces.isNetworkSide(target) || !nextRouter || !L3Interfaces.isRouter(nextRouter)) {
      // The next hop is not a router: it silently drops packets that are not for itself.
      return { kind: 'dropped', trace: ReachTraces.failure('gatewayUnreachable', router.id, journey) }
    }
    return { kind: 'router', iface: target }
  }

  /** Directly connected destination or own address: done, if the reply finds its way back. */
  private delivered(state: NetworkState, deviceId: string, journey: Journey, replyTo: string | null): ReachTrace {
    if (replyTo === null || this.replyCheck(state, deviceId, replyTo)) return ReachTraces.success(journey)
    // The request arrived; only the reply has no way back.
    return ReachTraces.failure('gatewayUnreachable', deviceId, journey)
  }

  /**
   * Only public destinations are served by the provider; the line must be up. The reply comes back
   * through this router, which must route it on to the sender.
   */
  private toInternet(state: NetworkState, router: Device, toIp: string, wan: WanService, journey: Journey, replyTo: string | null): ReachTrace {
    if (!Ipv4.isPublic(toIp)) return this.reported(state, ReachTraces.failure('noRouteToDestination', router.id, journey), router.id, replyTo)
    if (!wan.serviceUp) return ReachTraces.failure('wanDown', router.id, journey)
    const arrived: Journey = { ...journey, reached: [...journey.reached, wan.cloudId] }
    if (replyTo !== null && !this.replyCheck(state, router.id, replyTo)) return ReachTraces.failure('gatewayUnreachable', wan.cloudId, arrived)
    return ReachTraces.success(arrived)
  }

  /**
   * A routing loop: the hops from `loopStart` on repeat forever. The n-th router (0-based) receives
   * the packet with TTL `initialTtl - n`, so the TTL runs out at hop `initialTtl - 1`.
   */
  private looped(state: NetworkState, journey: Journey, loopStart: number, forwarding: Forwarding): ReachTrace {
    const expired = ReachTraces.hopAt({ routerHops: journey.routerHops, loopStart }, forwarding.initialTtl - 1)
    const reporterId = expired?.deviceId ?? journey.reached[0] ?? ''
    const trace = { ...ReachTraces.failure('ttlExpired', reporterId, journey), loopStart, expiredAtIp: expired?.ip ?? '' }
    return this.reported(state, trace, reporterId, forwarding.replyTo)
  }

  /**
   * An ICMP error (unreachable, time exceeded) from `reporterId` reaches the sender only if the
   * reporter can route back to it; otherwise it is lost and the sender hears nothing.
   */
  private reported(state: NetworkState, trace: ReachTrace, reporterId: string, replyTo: string | null): ReachTrace {
    if (replyTo === null || this.replyCheck(state, reporterId, replyTo)) return trace
    return { ...trace, silent: true }
  }

  private wanService(topology: Topology, exit: L3Interface): WanService | null {
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
