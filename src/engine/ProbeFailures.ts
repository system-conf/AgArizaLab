import type { FailureReasonV2 } from '../domain/v2'

/** How a failed ping / tracert probe looks to the sender. */
export type ProbeFailure =
  /** The packet never leaves the host: no link, no usable address, no gateway. */
  | { kind: 'generalFailure' }
  /** An ICMP "Destination host unreachable" from the sender itself (ARP failed) or from its gateway. */
  | { kind: 'unreachable'; reporter: 'self' | 'gateway' }
  /** The packet is lost on the way or the reply has no way back: silence. */
  | { kind: 'silent' }
  /** The packet looped between routers until a router answered "TTL expired in transit" (v2). */
  | { kind: 'ttlExpired' }

/** A failed reach result of either model (v1 reasons are a subset of v2 reasons). */
export interface FailedReach {
  reason: FailureReasonV2
  atDeviceId?: string
}

/** Maps a failed reach result to what Windows shows; shared by ping and tracert of v1 and v2. */
export class ProbeFailures {
  static classify(reach: FailedReach, sourceId: string): ProbeFailure {
    const atSource = reach.atDeviceId === sourceId
    switch (reach.reason) {
      case 'destinationNotInSegment':
      case 'noRouteToDestination':
        return { kind: 'unreachable', reporter: atSource ? 'self' : 'gateway' }
      case 'gatewayOutsideSubnet':
        return { kind: 'unreachable', reporter: 'self' }
      case 'gatewayUnreachable':
        // Gateway not answering ARP → own IP; destination with no route back → silence.
        return atSource ? { kind: 'unreachable', reporter: 'self' } : { kind: 'silent' }
      case 'ttlExpired':
        return { kind: 'ttlExpired' }
      case 'powerOff':
      case 'cableDisconnected':
      case 'portDisabled':
      case 'noIpAddress':
      case 'invalidConfig':
      case 'invalidHostAddress':
      case 'ipConflict':
      case 'gatewayNotSet':
        return { kind: 'generalFailure' }
      default:
        return { kind: 'silent' }
    }
  }
}
