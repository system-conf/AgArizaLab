import type { ReachResult } from '../domain/EngineContract'

/** How a failed ping / tracert probe looks to the sender. */
export type ProbeFailure =
  /** The packet never leaves the host: no link, no usable address, no gateway. */
  | { kind: 'generalFailure' }
  /** An ICMP "Destination host unreachable" from the sender itself (ARP failed) or from its gateway. */
  | { kind: 'unreachable'; reporter: 'self' | 'gateway' }
  /** The packet is lost on the way or the reply has no way back: silence. */
  | { kind: 'silent' }

/** Maps a failed reach result to what Windows shows; shared by ping and tracert. */
export class ProbeFailures {
  static classify(reach: Extract<ReachResult, { ok: false }>, sourceId: string): ProbeFailure {
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
