import type { Device } from '../domain'
import { Ipv4 } from './Ipv4'
import { type L3Interface, L3Interfaces } from './L3Interfaces'
import type { Topology } from './Topology'

export type AttachmentFailure = { ok: false; reason: 'cableDisconnected' | 'portDisabled'; atDeviceId: string }
export type Attachment = { ok: true } | AttachmentFailure

/** The interface a device sends from, with the default gateway it uses. */
export type SourceSelection = { ok: true; iface: L3Interface; gateway: string } | AttachmentFailure

/**
 * How end devices (and layer-2 switches with a management SVI) are plugged in: which NICs exist
 * for ipconfig, whether a NIC's link works, and which NIC a packet leaves from.
 */
export class HostAttachment {
  /**
   * The source interfaces of a non-routing device: host NICs (gateway from the host settings), or
   * the SVIs of a layer-2 switch (`ip default-gateway`).
   */
  static interfaces(device: Device): { interfaces: L3Interface[]; gateway: string } {
    if (device.host) return { interfaces: L3Interfaces.nics(device), gateway: device.host.defaultGateway }
    const svis = L3Interfaces.of(device).filter((iface) => iface.kind === 'svi')
    return { interfaces: svis, gateway: device.switching?.defaultGateway ?? '' }
  }

  /** NICs ipconfig lists: those with a cable or Wi-Fi association, else the first NIC. */
  static activeNics(topology: Topology, device: Device): L3Interface[] {
    const nics = L3Interfaces.nics(device)
    const linked = nics.filter((nic) => this.linkOf(topology, nic) !== undefined)
    if (linked.length > 0) return linked
    const first = nics[0]
    return first ? [first] : []
  }

  /** Physical state of one NIC's link, first problem from the near end. */
  static attach(topology: Topology, nic: L3Interface): Attachment {
    if (nic.kind === 'svi') return nic.adminUp ? { ok: true } : { ok: false, reason: 'portDisabled', atDeviceId: nic.deviceId }
    const link = this.linkOf(topology, nic)
    if (!link || !link.connected || nic.portId === undefined) return { ok: false, reason: 'cableDisconnected', atDeviceId: nic.deviceId }
    if (!nic.adminUp) return { ok: false, reason: 'portDisabled', atDeviceId: nic.deviceId }
    const far = topology.farEnd(link, nic.deviceId, nic.portId)
    if (!far.device || !far.device.powered || !far.port) {
      return { ok: false, reason: 'cableDisconnected', atDeviceId: far.end.deviceId }
    }
    if (!far.port.adminUp) return { ok: false, reason: 'portDisabled', atDeviceId: far.device.id }
    if (!topology.isUp(link)) return { ok: false, reason: 'cableDisconnected', atDeviceId: far.device.id }
    return { ok: true }
  }

  /**
   * The interface a packet to `toIp` leaves from. Only interfaces with a plugged link count (none →
   * cableDisconnected); wired before Wi-Fi. Among working ones: the one whose subnet holds `toIp`,
   * else the one whose subnet holds the gateway, else the first. No working one → its first problem.
   */
  static select(topology: Topology, device: Device, toIp: string): SourceSelection {
    const { interfaces, gateway } = this.interfaces(device)
    const plugged = interfaces.filter((iface) => iface.kind === 'svi' || this.linkOf(topology, iface)?.connected === true)
    if (plugged.length === 0) return { ok: false, reason: 'cableDisconnected', atDeviceId: device.id }

    const ordered = [...plugged].sort((first, second) => this.wirelessRank(device, first) - this.wirelessRank(device, second))
    let firstFailure: AttachmentFailure | null = null
    const working: L3Interface[] = []
    for (const iface of ordered) {
      const attachment = this.attach(topology, iface)
      if (attachment.ok) working.push(iface)
      else firstFailure ??= attachment
    }
    const chosen =
      working.find((iface) => this.holds(iface, toIp)) ?? working.find((iface) => this.holds(iface, gateway)) ?? working[0]
    if (chosen) return { ok: true, iface: chosen, gateway }
    return firstFailure ?? { ok: false, reason: 'cableDisconnected', atDeviceId: device.id }
  }

  /** The (single) link of a NIC's port. */
  private static linkOf(topology: Topology, nic: L3Interface) {
    return nic.portId === undefined ? undefined : topology.linksAt(nic.deviceId, nic.portId)[0]
  }

  private static holds(iface: L3Interface, ip: string): boolean {
    return L3Interfaces.isAddressed(iface) && Ipv4.sameSubnet(iface.address, ip, iface.mask)
  }

  private static wirelessRank(device: Device, iface: L3Interface): number {
    return device.ports.find((port) => port.id === iface.portId)?.medium === 'wireless' ? 1 : 0
  }
}
