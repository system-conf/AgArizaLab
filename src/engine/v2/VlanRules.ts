import type { DeviceV2, SwitchedPort } from '../../domain/v2'

/** 802.1Q tag of a frame on a wire; null = untagged. */
export type WireTag = number | null

/**
 * Switchport VLAN rules (MODEL_V2 §13), IOS style: an access port carries its access VLAN
 * untagged; a trunk carries `allowedVlans ∩ VLAN database`, the native VLAN untagged. A VLAN
 * missing from the database is inactive and forwards nothing.
 */
export class VlanRules {
  /** Devices without a VLAN database (access points) bridge every VLAN. */
  static inDatabase(device: DeviceV2, vlan: number): boolean {
    if (!device.switching) return true
    return device.switching.vlans.some((entry) => entry.id === vlan)
  }

  /** VLAN a frame arriving on the port belongs to, or null when the port drops it. */
  static ingress(device: DeviceV2, port: SwitchedPort, tag: WireTag): number | null {
    const { l2 } = port
    if (l2.mode === 'access') {
      return tag === null && VlanRules.inDatabase(device, l2.accessVlan) ? l2.accessVlan : null
    }
    const vlan = tag ?? l2.nativeVlan
    return VlanRules.trunkCarries(device, port, vlan) ? vlan : null
  }

  /** Tag a frame of `vlan` leaves the port with, or undefined when the port does not carry the VLAN. */
  static egress(device: DeviceV2, port: SwitchedPort, vlan: number): WireTag | undefined {
    const { l2 } = port
    if (l2.mode === 'access') return l2.accessVlan === vlan && VlanRules.inDatabase(device, vlan) ? null : undefined
    if (!VlanRules.trunkCarries(device, port, vlan)) return undefined
    return vlan === l2.nativeVlan ? null : vlan
  }

  private static trunkCarries(device: DeviceV2, port: SwitchedPort, vlan: number): boolean {
    const { allowedVlans } = port.l2
    const allowed = allowedVlans === 'all' || allowedVlans.includes(vlan)
    return allowed && VlanRules.inDatabase(device, vlan)
  }
}
