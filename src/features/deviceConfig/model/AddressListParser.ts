// Comma-separated IPv4 address lists (DHCP pool DNS servers, DNS forwarders).
import type { LocalizedMessage } from '../../../domain/Messages'
import { Ipv4 } from '../../../engine'
import { localizedMessage } from '../../../i18n/messageKeys'

export type AddressListResult = { ok: true; addresses: string[] } | { ok: false; error: LocalizedMessage }

export class AddressListParser {
  /** "8.8.8.8, 1.1.1.1" → ['8.8.8.8', '1.1.1.1']; blank → []; duplicates are dropped (order kept). */
  static parse(text: string): AddressListResult {
    const parts = text.split(/[\s,;]+/).filter((part) => part !== '')
    if (parts.some((part) => !Ipv4.isValid(part))) {
      return { ok: false, error: localizedMessage('deviceConfig:errors.addressList') }
    }
    return { ok: true, addresses: [...new Set(parts)] }
  }

  static format(addresses: readonly string[]): string {
    return addresses.join(', ')
  }
}
