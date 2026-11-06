// Switch virtual interfaces (`interface Vlan<n>`) and `ip default-gateway` of a switch.
import type { Svi, SwitchingSettings } from '../../../domain'
import { localizedMessage } from '../../../i18n/messageKeys'
import { newRowKey, optionalText, type FieldErrors } from './formTypes'
import { Ipv4Fields } from './Ipv4Fields'
import { VlanListParser } from './VlanListParser'

export interface SviDraft {
  key: string
  /** Keeps settings the form does not show (helper addresses, features). */
  original?: Svi
  vlan: string
  adminUp: boolean
  description: string
  address: string
  mask: string
}

export interface SviSectionDraft {
  svis: SviDraft[]
  defaultGateway: string
}

export type SviField = 'vlan' | 'address' | 'mask'

export interface SviSectionErrors {
  rows: FieldErrors<SviField>[]
  defaultGateway?: ReturnType<typeof Ipv4Fields.address>
}

export class SviFormModel {
  static toDraft(switching: SwitchingSettings): SviSectionDraft {
    return {
      svis: switching.svis.map((svi) => ({
        key: `svi${svi.vlan}`,
        original: svi,
        vlan: String(svi.vlan),
        adminUp: svi.adminUp,
        description: svi.description ?? '',
        address: svi.l3.ipv4.address,
        mask: svi.l3.ipv4.mask,
      })),
      defaultGateway: switching.defaultGateway,
    }
  }

  /** IOS creates an SVI administratively down (`shutdown`) until `no shutdown`; we start it up for convenience. */
  static newDraft(): SviDraft {
    return { key: newRowKey(), vlan: '', adminUp: true, description: '', address: '', mask: '' }
  }

  static validate(draft: SviSectionDraft): SviSectionErrors {
    const seen = new Set<number>()
    const rows = draft.svis.map((row) => {
      const errors: FieldErrors<SviField> = { ...Ipv4Fields.interfaceAddress(row.address, row.mask, false) }
      const vlan = VlanListParser.parseId(row.vlan)
      if (vlan === null) errors.vlan = localizedMessage('deviceConfig:errors.vlanRange')
      else if (seen.has(vlan)) errors.vlan = localizedMessage('deviceConfig:errors.duplicateVlan', { vlan })
      else seen.add(vlan)
      return errors
    })
    const gatewayError = Ipv4Fields.address(draft.defaultGateway, false)
    return gatewayError ? { rows, defaultGateway: gatewayError } : { rows }
  }

  /** SVIs sorted by VLAN. Call after `validate`. */
  static apply(draft: SviSectionDraft, switching: SwitchingSettings): SwitchingSettings {
    const svis = draft.svis.flatMap((row): Svi[] => {
      const vlan = VlanListParser.parseId(row.vlan)
      if (vlan === null) return []
      const address = row.address.trim()
      const description = optionalText(row.description)
      return [
        {
          vlan,
          adminUp: row.adminUp,
          ...(description !== undefined ? { description } : {}),
          l3: { ...row.original?.l3, ipv4: { addressing: 'static', address, mask: address === '' ? '' : row.mask.trim() } },
        },
      ]
    })
    return { ...switching, svis: svis.sort((a, b) => a.vlan - b.vlan), defaultGateway: draft.defaultGateway.trim() }
  }
}
