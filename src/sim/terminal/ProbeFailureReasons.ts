import type { FailureReason, NetworkState, ReachResult } from '../../domain'
import { HostAttachment } from '../../net/HostAttachment'
import { Ipv4 } from '../../net/Ipv4'
import { Topology } from '../../net/Topology'
import { DeviceProfiles, type EchoResult, type SimEvent, type SimReason } from '../contract'

/** A failed reach result in the rule engine's terms. */
export type FailedReach = Extract<ReachResult, { ok: false }>

/** Local refusals that share their name with the engine's FailureReason (§7.2: the packet never left). */
const SHARED_REASONS: readonly FailureReason[] = [
  'cableDisconnected',
  'portDisabled',
  'noIpAddress',
  'invalidConfig',
  'invalidHostAddress',
  'ipConflict',
  'gatewayNotSet',
  'gatewayOutsideSubnet',
  'ttlExpired',
]

/** The echo being explained. */
interface Probe {
  readonly network: NetworkState
  readonly sourceId: string
  readonly targetIp: string
}

/** How the engine names the drop of the echo request in `drop`. */
type DropRule = (drop: SimEvent, probe: Probe) => FailureReason

/**
 * Drops of the echo request that decide the outcome, with the engine's reason for each
 * (ReachabilityChecker / RouterForwarder). Drops not listed here (a flood copy at another NIC, an ARP
 * not for us…) never end the echo's journey.
 */
const DECISIVE_DROPS: Partial<Record<SimReason, DropRule>> = {
  // The sender's own ARP: the destination (same subnet) or the gateway did not answer; a router's ARP
  // for the next hop or the destination is the engine's "not in the exit segment".
  arpTimeout: (drop, probe) => (drop.deviceId === probe.sourceId ? ProbeFailureReasons.sourceArpFailure(probe) : 'destinationNotInSegment'),
  gatewayOutsideSubnet: () => 'gatewayOutsideSubnet',
  noRoute: (_drop, probe) => (Ipv4.isPublic(probe.targetIp) ? 'wanDown' : 'noRouteToDestination'),
  privateToInternet: () => 'noRouteToDestination',
  ispNoRoute: () => 'noRouteToDestination',
  ispServiceDown: () => 'wanDown',
  // The next hop (or gateway) does not route: it drops packets that are not for itself.
  notRouting: () => 'gatewayUnreachable',
  ttlExpired: () => 'ttlExpired',
}

/**
 * The rule engine's FailureReason for a failed echo, derived from what happened to the echo request
 * (coordinator decision 9 on the O3 mismatches): the first decisive drop names the reason and the
 * device; a request that was answered but whose reply never came back is the engine's "no way back"
 * (`gatewayUnreachable` at the answering device); an echo to a broadcast that everyone took in without
 * answering is the engine's silent `destinationNotInSegment` (coordinator decision 3).
 */
export class ProbeFailureReasons {
  static of(network: NetworkState, events: readonly SimEvent[], echo: EchoResult | undefined, sourceId: string, targetIp: string): FailedReach {
    if (echo === undefined) return { ok: false, reason: 'gatewayUnreachable', atDeviceId: sourceId }
    if (echo.kind === 'localFailure') {
      return { ok: false, reason: SHARED_REASONS.find((reason) => reason === echo.reason) ?? 'invalidConfig', atDeviceId: sourceId }
    }
    if (echo.kind === 'reply') throw new Error('A reply is not a failure')
    const probe: Probe = { network, sourceId, targetIp }
    const ofRequest = events.filter((event) => event.pduId === echo.requestPduId)
    for (const event of ofRequest) {
      const rule = event.action === 'dropped' && event.reason !== undefined ? DECISIVE_DROPS[event.reason] : undefined
      if (rule) return { ok: false, reason: rule(event, probe), atDeviceId: event.deviceId }
    }
    if (echo.kind === 'ttlExpired') return { ok: false, reason: 'ttlExpired' }
    const answered = ofRequest.find((event) => event.deviceId !== sourceId && event.action === 'replied')
    if (answered) return { ok: false, reason: 'gatewayUnreachable', atDeviceId: answered.deviceId }
    // A unicast echo for a device is always answered: taken in without a reply means it was a broadcast.
    const broadcast = ofRequest.some((event) => event.action === 'delivered' && event.layer === 3)
    if (broadcast) return { ok: false, reason: 'destinationNotInSegment', atDeviceId: ProbeFailureReasons.lastRouter(ofRequest, sourceId) }
    return { ok: false, reason: echo.kind === 'unreachable' ? 'destinationNotInSegment' : 'gatewayUnreachable' }
  }

  /** The last device that routed the packet (the one that put it on the broadcast's segment), else the source. */
  private static lastRouter(events: readonly SimEvent[], sourceId: string): string {
    return events.findLast((event) => event.layer === 3 && (event.action === 'forwarded' || event.action === 'sent'))?.deviceId ?? sourceId
  }

  /**
   * The source's ARP failed: for a destination in its own subnet the engine says the destination is not
   * in the segment, else the gateway is unreachable. A router source ARPs for its next hop.
   */
  static sourceArpFailure(probe: Probe): FailureReason {
    const source = Topology.of(probe.network).require(probe.sourceId)
    if (DeviceProfiles.of(source).ipRole === 'router') return 'destinationNotInSegment'
    const selection = HostAttachment.select(Topology.of(probe.network), source, probe.targetIp)
    const onLink = selection.ok && Ipv4.sameSubnet(selection.iface.address, probe.targetIp, selection.iface.mask)
    return onLink ? 'destinationNotInSegment' : 'gatewayUnreachable'
  }
}
