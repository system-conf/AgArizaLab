import type { Device, Port } from '../../domain'
import { localizedMessage } from '../../i18n/messageKeys'
import { type L3Interface, L3Interfaces } from '../../net/L3Interfaces'
import { VlanRules } from '../../net/VlanRules'
import type { DeviceChange, DeviceContext } from '../contract'
import { AddressClaims } from './AddressClaims'
import { ArpResolver } from './ArpResolver'
import { LinkInterfaces } from './LinkInterfaces'
import { LinkTables } from './LinkTables'

/**
 * Flush rules of a configuration or link change (docs/SIMULATION.md §5.3, S1): a port that went down
 * forgets its MAC entries and the ARP entries / waiting packets of its interfaces; changed switchport
 * VLAN settings forget that port's MAC entries; a removed VLAN its MAC entries; a changed address its
 * ARP entries, followed by a new duplicate-address probe (also when a link comes up).
 */
export class LinkChanges {
  static apply(ctx: DeviceContext, change: DeviceChange): void {
    LinkChanges.flushMacTable(ctx, change)
    const before = L3Interfaces.of(change.previous)
    for (const old of before) LinkChanges.flushInterface(ctx, change, old)
    AddressClaims.probeAll(ctx, `bg:${ctx.device.id}`, (iface) => LinkChanges.needsProbe(ctx, change, before, iface))
  }

  private static flushMacTable(ctx: DeviceContext, change: DeviceChange): void {
    const { device } = ctx
    const { previous } = change
    const stale = new Set(change.portsDown)
    const wirelessChanged = JSON.stringify(previous.wireless ?? null) !== JSON.stringify(device.wireless ?? null)
    for (const port of device.ports) {
      const old = previous.ports.find((candidate) => candidate.id === port.id)
      if (!old || LinkChanges.bridging(old) !== LinkChanges.bridging(port) || (wirelessChanged && port.role === 'radio')) stale.add(port.id)
    }
    const vlans = device.switching ? new Set(device.switching.vlans.map((vlan) => vlan.id)) : null
    const present = new Set(device.ports.map((port) => port.id))
    LinkTables.forgetMac(ctx, (entry) => stale.has(entry.portId) || !present.has(entry.portId) || (vlans !== null && !vlans.has(entry.vlan)))
  }

  /** An interface that is gone or cannot send any more loses everything; a new address only its ARP entries. */
  private static flushInterface(ctx: DeviceContext, change: DeviceChange, old: L3Interface): void {
    const now = L3Interfaces.find(ctx.device, old.id)
    const portDown = old.portId !== undefined && change.portsDown.includes(old.portId)
    const gone = !now || now.kind !== old.kind || now.portId !== old.portId || !LinkInterfaces.isUsable(ctx, now)
    if (gone || portDown) {
      if (!now) LinkTables.removeClaim(ctx, old.id)
      LinkTables.forgetArp(ctx, (entry) => entry.interfaceId === old.id)
      const waiting = LinkTables.takePending(ctx, (packet) => packet.interfaceId === old.id)
      const message = localizedMessage('simulation:notes.l2.linkDownDrop', { iface: old.id })
      for (const packet of waiting) ArpResolver.dropPending(ctx, packet, 'linkDown', message)
      return
    }
    if (now.address !== old.address || now.mask !== old.mask) {
      LinkTables.forgetArp(ctx, (entry) => entry.interfaceId === old.id && entry.state === 'reachable')
    }
  }

  private static needsProbe(ctx: DeviceContext, change: DeviceChange, before: readonly L3Interface[], iface: L3Interface): boolean {
    const old = before.find((candidate) => candidate.id === iface.id)
    if (!old) return true
    if (old.address !== iface.address || old.mask !== iface.mask || old.addressing !== iface.addressing) return true
    if (iface.portId !== undefined) return change.portsUp.includes(iface.portId)
    if (!old.adminUp && iface.adminUp) return true
    const vlan = iface.vlan ?? 0
    if (!VlanRules.inDatabase(change.previous, vlan)) return true
    return change.portsUp.some((portId) => LinkChanges.carries(ctx.device, portId, vlan))
  }

  /** A switchport (or radio) that carries the VLAN: an SVI probes again when such a port comes up. */
  private static carries(device: Device, portId: string, vlan: number): boolean {
    const port = device.ports.find((candidate) => candidate.id === portId)
    if (port?.role === 'radio') return (device.wireless?.ssids ?? []).some((ssid) => ssid.vlan === vlan)
    return port?.role === 'switched' && VlanRules.egress(device, port, vlan) !== undefined
  }

  /** What decides where a port bridges frames: its role and switchport settings. */
  private static bridging(port: Port): string {
    return port.role === 'switched' ? `switched:${JSON.stringify(port.l2)}` : port.role
  }
}
