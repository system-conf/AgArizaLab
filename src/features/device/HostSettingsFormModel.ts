import type { LocalizedMessage } from '../../domain/Messages'
import type { HostNetworkConfig, IpMode } from '../../domain/NetworkTypes'
import { Ipv4 } from '../../engine'
import { localizedMessage } from '../../i18n/messageKeys'

/** What the learner is typing into the IP settings form (all fields as raw text). */
export interface HostDraft {
  mode: IpMode
  ip: string
  mask: string
  gateway: string
  dnsPrimary: string
  dnsSecondary: string
}

/** Validation messages per field (`device:hostForm.errors.*`); the form translates them. */
export type DraftErrors = Partial<Record<keyof HostDraft, LocalizedMessage>>

const formatError = localizedMessage('device:hostForm.errors.invalidAddress')
const optionalFields = ['gateway', 'dnsPrimary', 'dnsSecondary'] as const

/** Form logic of HostSettingsForm: draft ↔ host config conversion and validation messages. */
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
    if (ip === '') errors.ip = localizedMessage('device:hostForm.errors.ipRequired')
    else if (!Ipv4.isValid(ip)) errors.ip = formatError
    if (mask === '') errors.mask = localizedMessage('device:hostForm.errors.maskRequired')
    else if (!Ipv4.isValidMask(mask)) errors.mask = localizedMessage('device:hostForm.errors.invalidMask')
    // Checkable only once both are valid: network and broadcast address depend on the mask.
    if (errors.ip === undefined && errors.mask === undefined && !Ipv4.isHostAddress(ip, mask)) {
      errors.ip = localizedMessage('device:hostForm.errors.notHostAddress')
    }
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
