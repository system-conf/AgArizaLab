import { HostAttachment } from '../../engine/HostAttachment'
import { Ipv4 } from '../../engine/Ipv4'
import { L3Interfaces } from '../../engine/L3Interfaces'
import { DeviceProfiles, type DeviceContext, type IcmpError, type SimReason } from '../contract'
import { InterfaceAddresses } from './InterfaceAddresses'
import { RouteLookup } from './RouteLookup'

/** How a client treats an echo the network layer refused to send. */
export type RefusedEcho =
  /** Windows "Reply from <own IP>: Destination host unreachable." */
  | { readonly kind: 'unreachable'; readonly fromIp: string }
  /** Dropped without an answer (router without a route to a public address): the echo times out. */
  | { readonly kind: 'silent' }
  /** Never sent (Windows "General failure"). */
  | { readonly kind: 'localFailure'; readonly reason: SimReason }

/** Shared rules of the ping and tracert clients (docs/SIMULATION.md §7.2, §10.1, engine ProbeFailures). */
export class EchoProbes {
  static classifyRefusal(ctx: DeviceContext, targetIp: string, reason: SimReason): RefusedEcho {
    switch (reason) {
      case 'gatewayOutsideSubnet':
      case 'privateToInternet':
        return { kind: 'unreachable', fromIp: EchoProbes.ownAddress(ctx, targetIp) }
      case 'noRoute':
        // Engine: no route at the source is "unreachable from own IP"; a public destination is wanDown (silence).
        return Ipv4.isPublic(targetIp) ? { kind: 'silent' } : { kind: 'unreachable', fromIp: EchoProbes.ownAddress(ctx, targetIp) }
      default:
        return { kind: 'localFailure', reason }
    }
  }

  /** The address this device sends to `targetIp` from ('' when it has none). */
  static ownAddress(ctx: DeviceContext, targetIp: string): string {
    if (DeviceProfiles.of(ctx.device).ipRole === 'router') {
      const route = RouteLookup.resolve(ctx.runtime.network.routes, targetIp)
      const exit = route ? L3Interfaces.find(ctx.device, route.exitInterfaceId) : undefined
      return InterfaceAddresses.sourceAddress(ctx.topology, ctx.device, exit)
    }
    const selection = HostAttachment.select(ctx.topology, ctx.device, targetIp)
    return selection.ok ? selection.iface.address : ''
  }

  /** Identifier and sequence of the echo request an ICMP error quotes, if it quotes one. */
  static quotedEcho(error: IcmpError): { identifier: number; sequence: number } | null {
    const transport = error.original.transport
    if (transport.kind !== 'icmp' || transport.type !== 'echoRequest') return null
    return { identifier: transport.identifier, sequence: transport.sequence }
  }
}
