import type { RadioPort, SwitchedPort } from '../../domain'
import { localizedMessage } from '../../i18n/messageKeys'
import { VlanRules } from '../../net/VlanRules'
import type { DeviceContext, EthernetFrame, EventBuilder, FrameArrival, SimReason } from '../contract'
import { LinkInterfaces } from './LinkInterfaces'

/** A frame copy leaving the bridge: the port, the Wi-Fi association (radio ports) and the 802.1Q tag. */
export interface EgressTarget {
  readonly portId: string
  readonly linkId?: string
  /** null = untagged. */
  readonly tag: number | null
  /** Radio copies: the SSID of the association. */
  readonly ssid?: string
}

/** Which ports / associations a copy may leave from. */
export interface EgressScope {
  /** Known unicast: only this port (kept even when its link is down, so the drop is visible). */
  readonly onlyPortId?: string
  /** The ingress port (wired); radio ports exclude only the ingress association. */
  readonly exceptPortId?: string
  readonly exceptLinkId?: string
}

export type IngressDrop = Extract<SimReason, 'vlanNotAllowed' | 'vlanInactive' | 'unknownSsid'>

/**
 * VLAN membership of a bridge's ports (docs/SIMULATION.md §7.1): switchports by VlanRules (access,
 * trunk, native, allowed ∩ database), radio ports by the SSID of each association (untagged only).
 */
export class BridgeVlans {
  /** VLAN of an arriving frame, or why the port drops it. Adds the teaching notes. */
  static ingress(ctx: DeviceContext, arrival: FrameArrival, port: SwitchedPort | RadioPort, frame: EthernetFrame, event: EventBuilder): number | IngressDrop {
    const tag = frame.tag?.vid ?? null
    if (port.role === 'radio') return BridgeVlans.radioIngress(ctx, arrival, tag, event)
    const { device } = ctx
    const { l2 } = port
    const vlan = l2.mode === 'access' ? l2.accessVlan : (tag ?? l2.nativeVlan)
    if (l2.mode === 'access' && tag !== null) {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.taggedOnAccess', { port: port.id, vlan: tag }))
      return 'vlanNotAllowed'
    }
    if (l2.mode === 'trunk' && l2.allowedVlans !== 'all' && !l2.allowedVlans.includes(vlan)) {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.vlanNotAllowed', { port: port.id, vlan }))
      return 'vlanNotAllowed'
    }
    if (VlanRules.ingress(device, port, tag) === null) {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.vlanInactive', { vlan }))
      return 'vlanInactive'
    }
    if (l2.mode === 'access') event.note(2, 'in', localizedMessage('simulation:notes.l2.accessIngress', { port: port.id, vlan }))
    else if (tag === null) event.note(2, 'in', localizedMessage('simulation:notes.l2.nativeIngress', { port: port.id, vlan }))
    else event.note(2, 'in', localizedMessage('simulation:notes.l2.trunkIngress', { port: port.id, vlan }))
    return vlan
  }

  /** Every copy a frame of `vlan` to `dst` leaves with, in port order (radio: association order). */
  static targets(ctx: DeviceContext, vlan: number, dst: string, scope: EgressScope): EgressTarget[] {
    const { device, topology } = ctx
    const targets: EgressTarget[] = []
    for (const port of device.ports) {
      if (scope.onlyPortId !== undefined && port.id !== scope.onlyPortId) continue
      if (port.id === scope.exceptPortId) continue
      if (port.role === 'switched') {
        const tag = VlanRules.egress(device, port, vlan)
        if (tag === undefined) continue
        const up = topology.linksAt(device.id, port.id).some((link) => topology.isUp(link))
        if (up || scope.onlyPortId !== undefined) targets.push({ portId: port.id, tag })
      } else if (port.role === 'radio') {
        targets.push(...BridgeVlans.radioTargets(ctx, port, vlan, dst, scope.exceptLinkId))
      }
    }
    return targets
  }

  /** The frame as it leaves through one target. */
  static tagged(frame: EthernetFrame, tag: number | null): EthernetFrame {
    const { src, dst, payload } = frame
    return tag === null ? { kind: 'ethernet', src, dst, payload } : { kind: 'ethernet', src, dst, tag: { vid: tag, pcp: frame.tag?.pcp ?? 0 }, payload }
  }

  private static radioIngress(ctx: DeviceContext, arrival: FrameArrival, tag: number | null, event: EventBuilder): number | IngressDrop {
    if (tag !== null) {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.taggedFromClient', { vlan: tag }))
      return 'vlanNotAllowed'
    }
    const link = ctx.topology.linksAt(ctx.device.id, arrival.portId).find((candidate) => candidate.id === arrival.linkId)
    const ssid = link?.cable === 'wireless' ? link.ssid : ''
    const entry = ctx.device.wireless?.ssids.find((candidate) => candidate.ssid === ssid)
    if (!entry) {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.unknownSsid', { ssid }))
      return 'unknownSsid'
    }
    if (!VlanRules.inDatabase(ctx.device, entry.vlan)) {
      event.note(2, 'in', localizedMessage('simulation:notes.l2.vlanInactive', { vlan: entry.vlan }))
      return 'vlanInactive'
    }
    event.note(2, 'in', localizedMessage('simulation:notes.l2.ssidIngress', { ssid, vlan: entry.vlan }))
    return entry.vlan
  }

  /** Associations of the VLAN's SSIDs; a unicast goes only to the client whose NIC has that MAC. */
  private static radioTargets(ctx: DeviceContext, port: RadioPort, vlan: number, dst: string, exceptLinkId: string | undefined): EgressTarget[] {
    const { device, topology } = ctx
    const targets: EgressTarget[] = []
    for (const link of topology.linksAt(device.id, port.id)) {
      if (link.id === exceptLinkId || link.cable !== 'wireless' || !topology.isUp(link)) continue
      const ssid = device.wireless?.ssids.find((candidate) => candidate.ssid === link.ssid)
      if (ssid?.vlan !== vlan) continue
      if (!LinkInterfaces.isGroupMac(dst) && topology.farEnd(link, device.id, port.id).port?.mac !== dst) continue
      targets.push({ portId: port.id, linkId: link.id, tag: null, ssid: link.ssid })
    }
    return targets
  }
}
