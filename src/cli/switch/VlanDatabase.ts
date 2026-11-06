// The VLAN database of a switch (`vlan 10`, `name SALES`, `no vlan 10`): pure edits of Device.switching.
import type { Device, SwitchingSettings, VlanEntry } from '../../domain'

/** VLAN 1 and the legacy FDDI / Token Ring VLANs: always present, never renamed or deleted. */
export const DEFAULT_VLAN = 1
const RESERVED_VLANS: readonly VlanEntry[] = [
  { id: 1002, name: 'fddi-default' },
  { id: 1003, name: 'token-ring-default' },
  { id: 1004, name: 'fddinet-default' },
  { id: 1005, name: 'trnet-default' },
]

export class VlanDatabase {
  /** IOS default name: 'default' for VLAN 1, 'VLAN0010' for VLAN 10. */
  static defaultName(id: number): string {
    return id === DEFAULT_VLAN ? 'default' : `VLAN${String(id).padStart(4, '0')}`
  }

  /** 1002–1005: listed by `show vlan` but not stored in the lab's database. */
  static isReserved(id: number): boolean {
    return RESERVED_VLANS.some((vlan) => vlan.id === id)
  }

  /** VLAN 1 or 1002–1005: IOS refuses to rename or delete them. */
  static isDefault(id: number): boolean {
    return id === DEFAULT_VLAN || VlanDatabase.isReserved(id)
  }

  static reserved(): readonly VlanEntry[] {
    return RESERVED_VLANS
  }

  static entries(device: Device): readonly VlanEntry[] {
    return device.switching?.vlans ?? []
  }

  static has(device: Device, id: number): boolean {
    return VlanDatabase.isReserved(id) || VlanDatabase.entries(device).some((vlan) => vlan.id === id)
  }

  /** Adds the VLANs that are missing, with their default names. */
  static ensure(device: Device, ids: readonly number[]): Device {
    const missing = ids.filter((id) => !VlanDatabase.has(device, id))
    if (missing.length === 0) return device
    return VlanDatabase.update(device, (vlans) => [...vlans, ...missing.map((id) => ({ id, name: VlanDatabase.defaultName(id) }))])
  }

  static remove(device: Device, ids: readonly number[]): Device {
    const removed = new Set(ids.filter((id) => !VlanDatabase.isDefault(id)))
    return VlanDatabase.update(device, (vlans) => vlans.filter((vlan) => !removed.has(vlan.id)))
  }

  /** `name` / `no name` (undefined = the default name). Missing VLANs are created first. */
  static rename(device: Device, ids: readonly number[], name: string | undefined): Device {
    const targets = new Set(ids.filter((id) => !VlanDatabase.isDefault(id)))
    const ensured = VlanDatabase.ensure(device, [...targets])
    return VlanDatabase.update(ensured, (vlans) =>
      vlans.map((vlan) => (targets.has(vlan.id) ? { ...vlan, name: name ?? VlanDatabase.defaultName(vlan.id) } : vlan)),
    )
  }

  private static update(device: Device, change: (vlans: readonly VlanEntry[]) => VlanEntry[]): Device {
    const switching: SwitchingSettings | undefined = device.switching
    if (switching === undefined) throw new Error(`Device ${device.id} has no VLAN database`)
    const vlans = change(switching.vlans).sort((a, b) => a.id - b.id)
    return { ...device, switching: { ...switching, vlans } }
  }
}
