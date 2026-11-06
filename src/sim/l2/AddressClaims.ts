import { localizedMessage } from '../../i18n/messageKeys'
import { type L3Interface, L3Interfaces } from '../../engine/L3Interfaces'
import { BROADCAST_MAC, type DeviceContext, type EventBuilder, UNSPECIFIED_IP, ZERO_MAC } from '../contract'
import { FrameSender } from './FrameSender'
import { LinkInterfaces } from './LinkInterfaces'
import { LinkTables } from './LinkTables'

/**
 * Duplicate address detection (RFC 5227, docs/SIMULATION.md §7.1). Addressed NICs and SVIs of a device
 * that does not route probe their static address when the device starts, the address changes or the
 * link comes up; DHCP addresses are claimed without a probe (the server checked). A conflict marks the
 * claim duplicate on both sides (engine parity); router-side interfaces defend and never give up.
 */
export class AddressClaims {
  /** Probes (or claims) every claim interface that `select` picks and that can send now. */
  static probeAll(ctx: DeviceContext, flowId: string, select: (iface: L3Interface) => boolean): void {
    for (const iface of L3Interfaces.of(ctx.device)) {
      if (!LinkInterfaces.hasClaim(ctx.device, iface) || !select(iface)) continue
      if (!L3Interfaces.isAddressed(iface)) {
        LinkTables.removeClaim(ctx, iface.id)
        continue
      }
      if (!LinkInterfaces.isUsable(ctx, iface)) continue
      AddressClaims.probe(ctx, iface, flowId)
    }
  }

  /** Another device uses the interface's address: the claim becomes duplicate (routers only note it). */
  static conflict(ctx: DeviceContext, iface: L3Interface, otherMac: string, event: EventBuilder, answered: boolean): void {
    const ip = iface.address
    if (!LinkInterfaces.hasClaim(ctx.device, iface)) {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.addressDefended', { ip, mac: otherMac }))
      return
    }
    event.note(
      2,
      'in',
      answered
        ? localizedMessage('simulation:notes.l2.duplicateAddress', { ip })
        : localizedMessage('simulation:notes.l2.addressConflict', { ip, mac: otherMac }),
    )
    const probedAt = LinkTables.claim(ctx, iface.id)?.probedAt ?? ctx.now
    LinkTables.putClaim(ctx, { interfaceId: iface.id, address: ip, duplicate: true, probedAt })
  }

  private static probe(ctx: DeviceContext, iface: L3Interface, flowId: string): void {
    LinkTables.putClaim(ctx, { interfaceId: iface.id, address: iface.address, duplicate: false, probedAt: ctx.now })
    if (iface.addressing === 'dhcp') return
    const event = ctx.openEvent({ flowId, ids: ctx.newPdu(flowId) })
    event.note(2, 'out', localizedMessage('simulation:notes.l2.arpProbe', { ip: iface.address }))
    const senderMac = LinkInterfaces.macOf(ctx.device, iface)
    FrameSender.ethernet(ctx, iface, event, BROADCAST_MAC, {
      kind: 'arp',
      operation: 'request',
      senderMac,
      senderIp: UNSPECIFIED_IP,
      targetMac: ZERO_MAC,
      targetIp: iface.address,
    })
    event.conclude('created', 2)
  }
}
