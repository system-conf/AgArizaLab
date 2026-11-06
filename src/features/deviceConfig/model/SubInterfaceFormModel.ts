// Router-on-a-stick sub-interfaces of a routed port (`interface Gi0/0.10`, `encapsulation dot1Q 10`).
import type { SubInterface } from '../../../domain/v2'
import { localizedMessage } from '../../../i18n/messageKeys'
import { newRowKey, optionalText, parseWholeNumber, type FieldErrors } from './formTypes'
import { Ipv4Fields } from './Ipv4Fields'
import { VlanListParser } from './VlanListParser'

export interface SubInterfaceDraft {
  key: string
  /** The sub-interface this row edits; keeps settings the form does not show (helper addresses…). */
  original?: SubInterface
  /** Number after the dot: 'Gi0/0.<suffix>'. */
  suffix: string
  vlan: string
  native: boolean
  adminUp: boolean
  description: string
  address: string
  mask: string
}

export type SubInterfaceField = 'suffix' | 'vlan' | 'native' | 'address' | 'mask'

const MAX_SUFFIX = 4294967295

export class SubInterfaceFormModel {
  static toDraft(sub: SubInterface, parentId: string): SubInterfaceDraft {
    const prefix = `${parentId}.`
    return {
      key: sub.id,
      original: sub,
      suffix: sub.id.startsWith(prefix) ? sub.id.slice(prefix.length) : sub.id,
      vlan: String(sub.vlan),
      native: sub.native === true,
      adminUp: sub.adminUp,
      description: sub.description ?? '',
      address: sub.l3.ipv4.address,
      mask: sub.l3.ipv4.mask,
    }
  }

  /** A new row with the next free number; the VLAN defaults to the same number (common practice). */
  static newDraft(existing: readonly SubInterfaceDraft[]): SubInterfaceDraft {
    const used = new Set(existing.map((row) => parseWholeNumber(row.suffix, 1, MAX_SUFFIX)))
    let suffix = 10
    while (used.has(suffix)) suffix += 10
    return { key: newRowKey(), suffix: String(suffix), vlan: String(suffix), native: false, adminUp: true, description: '', address: '', mask: '' }
  }

  static idOf(parentId: string, suffix: string): string {
    return `${parentId}.${suffix.trim()}`
  }

  /** One error map per row (same order). Numbers and dot1Q VLANs must be unique on the port. */
  static validate(rows: readonly SubInterfaceDraft[], parentId: string): FieldErrors<SubInterfaceField>[] {
    const seenSuffix = new Set<number>()
    const seenVlan = new Set<number>()
    let nativeSeen = false
    return rows.map((row) => {
      const errors: FieldErrors<SubInterfaceField> = { ...Ipv4Fields.interfaceAddress(row.address, row.mask, false) }
      const suffix = parseWholeNumber(row.suffix, 1, MAX_SUFFIX)
      if (suffix === null) errors.suffix = localizedMessage('deviceConfig:errors.subInterfaceNumber')
      else if (seenSuffix.has(suffix)) {
        errors.suffix = localizedMessage('deviceConfig:errors.duplicateSubInterface', { id: `${parentId}.${suffix}` })
      } else seenSuffix.add(suffix)
      const vlan = VlanListParser.parseId(row.vlan)
      if (vlan === null) errors.vlan = localizedMessage('deviceConfig:errors.vlanRange')
      else if (seenVlan.has(vlan)) errors.vlan = localizedMessage('deviceConfig:errors.duplicateDot1q', { vlan })
      else seenVlan.add(vlan)
      if (row.native && nativeSeen) errors.native = localizedMessage('deviceConfig:errors.duplicateNative')
      if (row.native) nativeSeen = true
      return errors
    })
  }

  /** Call only after `validate` found no errors. */
  static apply(row: SubInterfaceDraft, parentId: string): SubInterface {
    const description = optionalText(row.description)
    const suffix = parseWholeNumber(row.suffix, 1, MAX_SUFFIX) ?? 0
    return {
      id: `${parentId}.${suffix}`,
      vlan: VlanListParser.parseId(row.vlan) ?? 1,
      ...(row.native ? { native: true } : {}),
      adminUp: row.adminUp,
      ...(description !== undefined ? { description } : {}),
      l3: {
        ...row.original?.l3,
        ipv4: { addressing: 'static', address: row.address.trim(), mask: row.address.trim() === '' ? '' : row.mask.trim() },
      },
    }
  }
}
