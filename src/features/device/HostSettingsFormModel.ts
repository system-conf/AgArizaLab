import type { HostNetworkConfig, IpMode } from '../../domain/NetworkTypes'
import { Ipv4 } from '../../engine'

/** What the player is typing into the IP settings form (all fields as raw text). */
export interface HostDraft {
  mode: IpMode
  ip: string
  mask: string
  gateway: string
  dnsPrimary: string
  dnsSecondary: string
}

export type DraftErrors = Partial<Record<keyof HostDraft, string>>

const formatError = 'Geçerli bir IPv4 adresi yazın (ör. 192.168.1.10).'
const optionalFields = ['gateway', 'dnsPrimary', 'dnsSecondary'] as const

/** Form logic of HostSettingsForm: draft ↔ host config conversion and Turkish validation messages. */
export class HostSettingsFormModel {
  static toDraft(host: HostNetworkConfig): HostDraft {
    return {
      mode: host.mode,
      ip: host.ip,
      mask: host.mask,
      gateway: host.gateway,
      dnsPrimary: host.dns[0] ?? '',
      dnsSecondary: host.dns[1] ?? '',
    }
  }

  static validate(draft: HostDraft): DraftErrors {
    // DHCP mode: the addresses come from the server, so the fields are not checked.
    if (draft.mode === 'dhcp') return {}
    const errors: DraftErrors = {}
    const ip = draft.ip.trim()
    const mask = draft.mask.trim()
    if (ip === '') errors.ip = 'Statik modda IP adresi gerekli.'
    else if (!Ipv4.isValid(ip)) errors.ip = formatError
    if (mask === '') errors.mask = 'Statik modda alt ağ maskesi gerekli.'
    else if (!Ipv4.isValidMask(mask)) errors.mask = 'Geçerli bir maske yazın (ör. 255.255.255.0).'
    for (const field of optionalFields) {
      const value = draft[field].trim()
      if (value !== '' && !Ipv4.isValid(value)) errors[field] = formatError
    }
    return errors
  }

  /** Errors worth showing while typing: only for fields that are not empty. */
  static liveErrors(errors: DraftErrors, draft: HostDraft): DraftErrors {
    const live: DraftErrors = {}
    for (const field of Object.keys(errors) as (keyof HostDraft)[]) {
      if (draft[field].trim() !== '') live[field] = errors[field]
    }
    return live
  }

  static toHost(draft: HostDraft, previous: HostNetworkConfig): HostNetworkConfig {
    if (draft.mode === 'dhcp') {
      // Address fields stay as they are until the DHCP server hands out new ones.
      return { ...previous, mode: 'dhcp' }
    }
    return {
      mode: 'static',
      ip: draft.ip.trim(),
      mask: draft.mask.trim(),
      gateway: draft.gateway.trim(),
      dns: [draft.dnsPrimary.trim(), draft.dnsSecondary.trim()].filter((value) => value !== ''),
    }
  }
}
