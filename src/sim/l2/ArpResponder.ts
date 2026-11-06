import { localizedMessage } from '../../i18n/messageKeys'
import { Ipv4 } from '../../engine/Ipv4'
import type { L3Interface } from '../../engine/L3Interfaces'
import { type ArpPacket, type DeviceContext, type EthernetFrame, type EventBuilder, UNSPECIFIED_IP } from '../contract'
import { AddressClaims } from './AddressClaims'
import { ArpResolver } from './ArpResolver'
import { FrameSender } from './FrameSender'
import { BOOT_FLOW, LinkInterfaces } from './LinkInterfaces'
import { LinkTables } from './LinkTables'

/**
 * ARP on the receiving interface (docs/SIMULATION.md §7.1): answer requests for the interface's own
 * address only, learn the sender of requests for us and of replies, defend against probes for our
 * address and notice anyone else using it.
 */
export class ArpResponder {
  static receive(ctx: DeviceContext, iface: L3Interface, frame: EthernetFrame, arp: ArpPacket, event: EventBuilder): void {
    const ownMac = LinkInterfaces.macOf(ctx.device, iface)
    const fromOther = arp.senderMac !== ownMac
    const conflicting = fromOther && iface.address !== '' && arp.senderIp === iface.address
    if (conflicting) AddressClaims.conflict(ctx, iface, arp.senderMac, event, arp.operation === 'reply')
    if (arp.operation === 'reply') return ArpResponder.receiveReply(ctx, iface, arp, event, conflicting)
    if (arp.senderIp === UNSPECIFIED_IP) return ArpResponder.receiveProbe(ctx, iface, arp, event, fromOther)
    if (LinkInterfaces.answersFor(ctx, iface, arp.targetIp)) {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.arpRequestForUs', { ip: arp.targetIp }))
      if (!conflicting && Ipv4.isValid(arp.senderIp)) {
        event.note(2, 'in', localizedMessage('simulation:notes.l2.arpSenderLearned', { ip: arp.senderIp, mac: arp.senderMac }))
        ArpResolver.learn(ctx, iface, arp.senderIp, arp.senderMac, event.flowId)
      }
      event.conclude('replied', 2)
      return ArpResponder.reply(ctx, iface, arp, event)
    }
    ArpResponder.mergeSender(ctx, iface, arp, frame, event.flowId)
    const key = iface.address === arp.targetIp ? 'simulation:notes.l2.arpCannotAnswer' : 'simulation:notes.l2.arpRequestNotForUs'
    event.note(2, 'in', localizedMessage(key, { ip: arp.targetIp }))
    event.conclude('dropped', 2, 'arpNotForUs')
  }

  /** Someone probes: if it is our address, we answer so the prober backs off (and, as a NIC, lose it too). */
  private static receiveProbe(ctx: DeviceContext, iface: L3Interface, arp: ArpPacket, event: EventBuilder, fromOther: boolean): void {
    if (fromOther && iface.adminUp && iface.address !== '' && arp.targetIp === iface.address) {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.probeForOurAddress', { ip: arp.targetIp }))
      AddressClaims.conflict(ctx, iface, arp.senderMac, event, false)
      event.conclude('replied', 2)
      return ArpResponder.reply(ctx, iface, arp, event)
    }
    event.note(2, 'in', localizedMessage('simulation:notes.l2.arpRequestNotForUs', { ip: arp.targetIp }))
    event.conclude('dropped', 2, 'arpNotForUs')
  }

  private static receiveReply(ctx: DeviceContext, iface: L3Interface, arp: ArpPacket, event: EventBuilder, conflicting: boolean): void {
    if (conflicting) return event.conclude('delivered', 2)
    const asked = LinkTables.arpLookup(ctx, iface.id, arp.senderIp) !== undefined
    if (asked || (iface.address !== '' && arp.targetIp === iface.address)) {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.arpReplyLearned', { ip: arp.senderIp, mac: arp.senderMac }))
      ArpResolver.learn(ctx, iface, arp.senderIp, arp.senderMac, event.flowId)
      return event.conclude('delivered', 2)
    }
    event.note(2, 'in', localizedMessage('simulation:notes.l2.arpReplyUnsolicited', { ip: arp.senderIp }))
    event.conclude('delivered', 2)
  }

  /** RFC 826: a request not for us still refreshes the sender's entry when we already have one. */
  private static mergeSender(ctx: DeviceContext, iface: L3Interface, arp: ArpPacket, frame: EthernetFrame, flowId: string): void {
    const known = LinkTables.arpLookup(ctx, iface.id, arp.senderIp)
    if (flowId === BOOT_FLOW || known?.state !== 'reachable' || known.type !== 'dynamic' || frame.src !== arp.senderMac) return
    LinkTables.putArp(ctx, { ...known, mac: arp.senderMac, updatedAt: ctx.now, expiresAt: ctx.now + LinkInterfaces.arpAgeMs(ctx.device) })
  }

  /** Unicast reply to the asker; a probe's reply carries target IP 0.0.0.0 like the probe's sender IP. */
  private static reply(ctx: DeviceContext, iface: L3Interface, arp: ArpPacket, cause: EventBuilder): void {
    const senderMac = LinkInterfaces.macOf(ctx.device, iface)
    const event = ctx.openEvent({ flowId: cause.flowId, ids: ctx.newPdu(cause.flowId), causeEventId: cause.id })
    event.note(2, 'out', localizedMessage('simulation:notes.l2.arpReplyCreated', { ip: iface.address, mac: senderMac }))
    FrameSender.ethernet(ctx, iface, event, arp.senderMac, {
      kind: 'arp',
      operation: 'reply',
      senderMac,
      senderIp: iface.address,
      targetMac: arp.senderMac,
      targetIp: arp.senderIp,
    })
    event.conclude('created', 2)
  }
}
