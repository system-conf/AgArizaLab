// End-device "global settings": default gateway, DNS servers and app links (MODEL_V2 §3).
import type { AppLinkV2, DeviceKindV2, HostSettings } from '../../../domain/v2'
import { localizedMessage } from '../../../i18n/messageKeys'
import { newRowKey, type FieldErrors } from './formTypes'
import { Ipv4Fields } from './Ipv4Fields'

export interface HostDraft {
  gateway: string
  dnsPrimary: string
  dnsSecondary: string
}

export type HostField = keyof HostDraft

export interface AppLinkDraft {
  key: string
  /** '' for a new link: an id is chosen on save. */
  id: string
  label: string
  targetIp: string
  targetKind: DeviceKindV2
}

export type AppLinkField = 'label' | 'targetIp'

export const MAX_APP_LINK_LABEL = 40

export class HostSettingsModel {
  static toDraft(host: HostSettings): HostDraft {
    return { gateway: host.defaultGateway, dnsPrimary: host.dnsServers[0] ?? '', dnsSecondary: host.dnsServers[1] ?? '' }
  }

  /** Format only: whether the gateway fits the subnet is for the learner to find out. */
  static validate(draft: HostDraft): FieldErrors<HostField> {
    const errors: FieldErrors<HostField> = {}
    for (const field of ['gateway', 'dnsPrimary', 'dnsSecondary'] as const) {
      const error = Ipv4Fields.address(draft[field], false)
      if (error) errors[field] = error
    }
    return errors
  }

  /** DNS servers beyond the second (e.g. from DHCP) are kept. Call after `validate`. */
  static apply(draft: HostDraft, host: HostSettings): HostSettings {
    const primary = [draft.dnsPrimary.trim(), draft.dnsSecondary.trim()].filter((server) => server !== '')
    return { ...host, defaultGateway: draft.gateway.trim(), dnsServers: [...primary, ...host.dnsServers.slice(2)] }
  }

  static appLinkDrafts(host: HostSettings): AppLinkDraft[] {
    return host.appLinks.map((link) => ({ key: link.id, id: link.id, label: link.label, targetIp: link.targetIp, targetKind: link.targetKind }))
  }

  static newAppLink(): AppLinkDraft {
    return { key: newRowKey(), id: '', label: '', targetIp: '', targetKind: 'printer' }
  }

  static validateAppLinks(rows: readonly AppLinkDraft[]): FieldErrors<AppLinkField>[] {
    return rows.map((row) => {
      const errors: FieldErrors<AppLinkField> = {}
      const label = row.label.trim()
      if (label === '') errors.label = localizedMessage('deviceConfig:errors.required')
      else if (label.length > MAX_APP_LINK_LABEL) errors.label = localizedMessage('deviceConfig:errors.tooLong', { max: MAX_APP_LINK_LABEL })
      const ipError = Ipv4Fields.address(row.targetIp, true)
      if (ipError) errors.targetIp = ipError
      return errors
    })
  }

  /** New links get the first free id 'appLink<n>'. Call after `validateAppLinks`. */
  static applyAppLinks(rows: readonly AppLinkDraft[], host: HostSettings): HostSettings {
    const used = new Set(rows.map((row) => row.id).filter((id) => id !== ''))
    let counter = 1
    const freshId = (): string => {
      while (used.has(`appLink${counter}`)) counter += 1
      const id = `appLink${counter}`
      used.add(id)
      return id
    }
    const appLinks = rows.map((row): AppLinkV2 => ({
      id: row.id === '' ? freshId() : row.id,
      label: row.label.trim(),
      targetIp: row.targetIp.trim(),
      targetKind: row.targetKind,
    }))
    return { ...host, appLinks }
  }
}
