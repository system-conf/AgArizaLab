// DNS service of a device: on/off, forwarders and static A records (name → IPv4).
import type { DnsServerSettings } from '../../../domain/v2'
import type { LocalizedMessage } from '../../../domain/Messages'
import { localizedMessage } from '../../../i18n/messageKeys'
import { AddressListParser } from './AddressListParser'
import { newRowKey, type FieldErrors } from './formTypes'
import { Ipv4Fields } from './Ipv4Fields'

export interface DnsRecordDraft {
  key: string
  name: string
  address: string
}

export interface DnsDraft {
  enabled: boolean
  forwarders: string
  records: DnsRecordDraft[]
}

export type DnsRecordField = 'name' | 'address'

export interface DnsErrors {
  forwarders?: LocalizedMessage
  records: FieldErrors<DnsRecordField>[]
}

const LABEL = '[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?'
const HOST_NAME = new RegExp(`^${LABEL}(\\.${LABEL})*$`, 'i')
const MAX_HOST_NAME = 253

const EMPTY_SERVER: DnsServerSettings = { enabled: false, forwarders: [], records: [] }

export class DnsServiceFormModel {
  static toDraft(settings: DnsServerSettings | undefined): DnsDraft {
    const server = settings ?? EMPTY_SERVER
    return {
      enabled: server.enabled,
      forwarders: AddressListParser.format(server.forwarders),
      records: server.records.map((record, index) => ({ key: `record${index}`, name: record.name, address: record.address })),
    }
  }

  static newRecord(): DnsRecordDraft {
    return { key: newRowKey(), name: '', address: '' }
  }

  static isHostName(text: string): boolean {
    const name = text.trim()
    return name.length <= MAX_HOST_NAME && HOST_NAME.test(name)
  }

  static validate(draft: DnsDraft): DnsErrors {
    const forwarders = AddressListParser.parse(draft.forwarders)
    const seen = new Set<string>()
    const records = draft.records.map((row) => {
      const errors: FieldErrors<DnsRecordField> = {}
      const name = row.name.trim().toLowerCase()
      if (name === '') errors.name = localizedMessage('deviceConfig:errors.required')
      else if (!DnsServiceFormModel.isHostName(name)) errors.name = localizedMessage('deviceConfig:errors.hostName')
      else if (seen.has(name)) errors.name = localizedMessage('deviceConfig:errors.duplicateRecord', { name })
      seen.add(name)
      const addressError = Ipv4Fields.address(row.address, true)
      if (addressError) errors.address = addressError
      return errors
    })
    return forwarders.ok ? { records } : { forwarders: forwarders.error, records }
  }

  static isValid(errors: DnsErrors): boolean {
    return errors.forwarders === undefined && errors.records.every((row) => Object.keys(row).length === 0)
  }

  /** Names are stored in lower case (DNS is case-insensitive). Call after `validate`. */
  static apply(draft: DnsDraft): DnsServerSettings {
    const forwarders = AddressListParser.parse(draft.forwarders)
    return {
      enabled: draft.enabled,
      forwarders: forwarders.ok ? forwarders.addresses : [],
      records: draft.records.map((row) => ({ type: 'A', name: row.name.trim().toLowerCase(), address: row.address.trim() })),
    }
  }
}
