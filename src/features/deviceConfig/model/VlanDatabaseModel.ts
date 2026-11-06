// VLAN database of a switch (`vlan <id>` / `name <name>`): rows, validation, and who uses a VLAN.
import type { Device, VlanEntry } from '../../../domain'
import { localizedMessage } from '../../../i18n/messageKeys'
import { newRowKey, type FieldErrors } from './formTypes'
import { VlanListParser } from './VlanListParser'

export interface VlanRowDraft {
  key: string
  id: string
  name: string
  /** Already in the saved database: the id is fixed, only the name can change. */
  existing: boolean
}

export type VlanField = 'id' | 'name'

/** IOS limit for VLAN names. */
export const MAX_VLAN_NAME = 32
export const DEFAULT_VLAN = 1

export class VlanDatabaseModel {
  static toDrafts(vlans: readonly VlanEntry[]): VlanRowDraft[] {
    return vlans.map((vlan) => ({ key: `vlan${vlan.id}`, id: String(vlan.id), name: vlan.name, existing: true }))
  }

  static newDraft(): VlanRowDraft {
    return { key: newRowKey(), id: '', name: '', existing: false }
  }

  /** IOS default names: 'default' for VLAN 1, 'VLAN0010' for VLAN 10. */
  static defaultName(id: number): string {
    return id === DEFAULT_VLAN ? 'default' : `VLAN${String(id).padStart(4, '0')}`
  }

  static isRemovable(row: VlanRowDraft): boolean {
    return !(row.existing && VlanListParser.parseId(row.id) === DEFAULT_VLAN)
  }

  static validate(rows: readonly VlanRowDraft[]): FieldErrors<VlanField>[] {
    const seen = new Set<number>()
    return rows.map((row) => {
      const errors: FieldErrors<VlanField> = {}
      const id = VlanListParser.parseId(row.id)
      if (id === null) errors.id = localizedMessage('deviceConfig:errors.vlanRange')
      else if (seen.has(id)) errors.id = localizedMessage('deviceConfig:errors.duplicateVlan', { vlan: id })
      else seen.add(id)
      if (row.name.trim().length > MAX_VLAN_NAME) errors.name = localizedMessage('deviceConfig:errors.tooLong', { max: MAX_VLAN_NAME })
      return errors
    })
  }

  /** Sorted by id; VLAN 1 is always present (it cannot be removed). Call after `validate`. */
  static apply(rows: readonly VlanRowDraft[]): VlanEntry[] {
    const entries = rows.flatMap((row) => {
      const id = VlanListParser.parseId(row.id)
      return id === null ? [] : [{ id, name: row.name.trim() === '' ? VlanDatabaseModel.defaultName(id) : row.name.trim() }]
    })
    if (!entries.some((entry) => entry.id === DEFAULT_VLAN)) entries.push({ id: DEFAULT_VLAN, name: VlanDatabaseModel.defaultName(DEFAULT_VLAN) })
    return entries.sort((a, b) => a.id - b.id)
  }

  /**
   * Interfaces and SSIDs of the device that name this VLAN explicitly: access ports, trunk native /
   * allowed lists, the SVI `Vlan<id>` and SSIDs. Trunks allowing 'all' are not listed.
   */
  static usage(device: Device, vlan: number): string[] {
    const users: string[] = []
    for (const port of device.ports) {
      if (port.role !== 'switched') continue
      const { mode, accessVlan, nativeVlan, allowedVlans } = port.l2
      const usesIt =
        mode === 'access' ? accessVlan === vlan : nativeVlan === vlan || (allowedVlans !== 'all' && allowedVlans.includes(vlan))
      if (usesIt) users.push(port.id)
    }
    if (device.switching?.svis.some((svi) => svi.vlan === vlan)) users.push(`Vlan${vlan}`)
    for (const ssid of device.wireless?.ssids ?? []) {
      if (ssid.vlan === vlan) users.push(ssid.ssid)
    }
    return users
  }
}
