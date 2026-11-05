import type { ReachResult } from '../domain/EngineContract'
import type { Device, HostNetworkConfig, NetworkState, RouterInterface } from '../domain/NetworkTypes'
import { DeviceLookup } from './DeviceLookup'
import { Ipv4 } from './Ipv4'
import type { Segment, SegmentFinder } from './SegmentFinder'

/** A host that passed the local checks (power, link, address). */
interface ReadyHost {
  device: Device
  host: HostNetworkConfig
  segment: Segment
}

type ReadyResult = { ok: true; ready: ReadyHost } | { ok: false; result: ReachResult }

/** Answers "can this device ping that address?" following PLAN §4.2 in order. */
export class ReachabilityChecker {
  private readonly segments: SegmentFinder

  constructor(segments: SegmentFinder) {
    this.segments = segments
  }

  reach(state: NetworkState, fromDeviceId: string, toIp: string): ReachResult {
    const from = DeviceLookup.require(state, fromDeviceId)
    if (!from.powered) return { ok: false, reason: 'powerOff', atDeviceId: from.id }
    // Loopback is answered by the device itself, even without a network link.
    if (Ipv4.isLoopback(toIp)) return { ok: true, path: [from.id] }

    const prepared = this.prepare(state, from)
    if (!prepared.ok) return prepared.result
    const { device, host, segment } = prepared.ready

    if (!Ipv4.isValid(toIp)) return { ok: false, reason: 'invalidConfig', atDeviceId: device.id }
    if (toIp === host.ip) return { ok: true, path: [device.id] }

    if (Ipv4.sameSubnet(host.ip, toIp, host.mask)) {
      return this.reachLocal(state, segment, toIp, device.id)
    }
    return this.reachThroughGateway(state, prepared.ready, toIp)
  }

  /** Steps 2–3: link, port and own address. */
  private prepare(state: NetworkState, from: Device): ReadyResult {
    const host = from.host
    if (!host) return { ok: false, result: { ok: false, reason: 'cableDisconnected', atDeviceId: from.id } }

    const attachment = this.segments.attachment(state, from)
    if (!attachment.ok) {
      return { ok: false, result: { ok: false, reason: attachment.reason, atDeviceId: attachment.atDeviceId ?? from.id } }
    }
    if (host.ip === '') return { ok: false, result: { ok: false, reason: 'noIpAddress', atDeviceId: from.id } }
    if (!Ipv4.isValid(host.ip) || !Ipv4.isValidMask(host.mask)) {
      return { ok: false, result: { ok: false, reason: 'invalidConfig', atDeviceId: from.id } }
    }
    const segment = this.segments.segment(state, from.id, attachment.vlan)
    return { ok: true, ready: { device: from, host, segment } }
  }

  /** Step 4: destination in the sender's own subnet must be in its layer-2 segment. */
  private reachLocal(state: NetworkState, segment: Segment, toIp: string, fromId: string): ReachResult {
    const target = this.segments.findAddress(state, segment, toIp)
    if (!target) return { ok: false, reason: 'destinationNotInSegment', atDeviceId: fromId }
    return { ok: true, path: this.segments.pathTo(segment, target.id) }
  }

  /** Step 5: the default gateway must be a router interface inside the segment. */
  private reachThroughGateway(state: NetworkState, ready: ReadyHost, toIp: string): ReachResult {
    const { device, host, segment } = ready
    if (host.gateway === '') return { ok: false, reason: 'gatewayNotSet', atDeviceId: device.id }
    if (!Ipv4.isValid(host.gateway)) return { ok: false, reason: 'invalidConfig', atDeviceId: device.id }
    if (!Ipv4.sameSubnet(host.ip, host.gateway, host.mask)) {
      return { ok: false, reason: 'gatewayOutsideSubnet', atDeviceId: device.id }
    }

    const router = this.segments.findAddress(state, segment, host.gateway)
    const gatewayInterface = router?.routerInterfaces?.find(
      (candidate) => candidate.ip === host.gateway && candidate.vlan === segment.vlan,
    )
    if (!router || router.kind !== 'router' || !gatewayInterface) {
      return { ok: false, reason: 'gatewayUnreachable', atDeviceId: device.id }
    }
    const pathToRouter = this.segments.pathTo(segment, router.id)
    return this.routeAtRouter(state, router, toIp, pathToRouter)
  }

  /** Step 6: the router forwards to one of its subnets or to the internet. */
  private routeAtRouter(state: NetworkState, router: Device, toIp: string, pathToRouter: string[]): ReachResult {
    const interfaces = router.routerInterfaces ?? []
    if (interfaces.some((candidate) => candidate.ip === toIp)) return { ok: true, path: pathToRouter }

    const outgoing = interfaces.find((candidate) => Ipv4.sameSubnet(candidate.ip, toIp, candidate.mask))
    if (outgoing) return this.deliverToVlan(state, router, outgoing, toIp, pathToRouter)

    if (!Ipv4.isPrivate(toIp)) {
      if (router.wanUp !== true) return { ok: false, reason: 'wanDown', atDeviceId: router.id }
      return { ok: true, path: [...pathToRouter, ...this.internetBehind(state, router)] }
    }
    return { ok: false, reason: 'noRouteToDestination', atDeviceId: router.id }
  }

  /** Inter-VLAN delivery; the destination must route its reply back through the same interface. */
  private deliverToVlan(
    state: NetworkState,
    router: Device,
    outgoing: RouterInterface,
    toIp: string,
    pathToRouter: string[],
  ): ReachResult {
    const vlanSegment = this.segments.segment(state, router.id, outgoing.vlan)
    const target = this.segments.findAddress(state, vlanSegment, toIp)
    if (!target) return { ok: false, reason: 'destinationNotInSegment', atDeviceId: router.id }
    if (target.host?.gateway !== outgoing.ip) {
      return { ok: false, reason: 'gatewayUnreachable', atDeviceId: target.id }
    }
    const pathFromRouter = this.segments.pathTo(vlanSegment, target.id).slice(1)
    return { ok: true, path: [...pathToRouter, ...pathFromRouter] }
  }

  /** The internet device on the router's WAN port, for the display path. */
  private internetBehind(state: NetworkState, router: Device): string[] {
    const wanLink = state.links.find(
      (link) =>
        link.connected &&
        ((link.a.deviceId === router.id && link.a.portId === 'wan') ||
          (link.b.deviceId === router.id && link.b.portId === 'wan')),
    )
    if (!wanLink) return []
    return [wanLink.a.deviceId === router.id ? wanLink.b.deviceId : wanLink.a.deviceId]
  }
}
