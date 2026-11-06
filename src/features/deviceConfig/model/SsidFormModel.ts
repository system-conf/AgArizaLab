// SSIDs of an access point or wireless router (open networks only until the security pack 5.6).
import type { SsidSettings, WirelessSecurity, WirelessSettings } from '../../../domain'
import { localizedMessage } from '../../../i18n/messageKeys'
import { newRowKey, type FieldErrors } from './formTypes'
import { VlanListParser } from './VlanListParser'

export interface SsidDraft {
  key: string
  ssid: string
  vlan: string
  security: WirelessSecurity['mode']
}

export type SsidField = 'ssid' | 'vlan'

/** 802.11 limit: 32 octets. */
export const MAX_SSID_LENGTH = 32

export const SECURITY_MODES: readonly WirelessSecurity['mode'][] = ['open']

export class SsidFormModel {
  static toDrafts(wireless: WirelessSettings): SsidDraft[] {
    return wireless.ssids.map((ssid, index) => ({ key: `ssid${index}`, ssid: ssid.ssid, vlan: String(ssid.vlan), security: ssid.security.mode }))
  }

  static newDraft(): SsidDraft {
    return { key: newRowKey(), ssid: '', vlan: '1', security: 'open' }
  }

  static validate(rows: readonly SsidDraft[]): FieldErrors<SsidField>[] {
    const seen = new Set<string>()
    return rows.map((row) => {
      const errors: FieldErrors<SsidField> = {}
      const name = row.ssid.trim()
      if (name === '') errors.ssid = localizedMessage('deviceConfig:errors.required')
      else if (new TextEncoder().encode(name).length > MAX_SSID_LENGTH) errors.ssid = localizedMessage('deviceConfig:errors.tooLong', { max: MAX_SSID_LENGTH })
      else if (seen.has(name)) errors.ssid = localizedMessage('deviceConfig:errors.duplicateName', { name })
      seen.add(name)
      const vlanError = VlanListParser.idError(row.vlan)
      if (vlanError) errors.vlan = vlanError
      return errors
    })
  }

  /** Call after `validate`. */
  static apply(rows: readonly SsidDraft[], wireless: WirelessSettings): WirelessSettings {
    const ssids = rows.map((row): SsidSettings => ({
      ssid: row.ssid.trim(),
      vlan: VlanListParser.parseId(row.vlan) ?? 1,
      security: { mode: row.security },
    }))
    return { ...wireless, ssids }
  }
}
