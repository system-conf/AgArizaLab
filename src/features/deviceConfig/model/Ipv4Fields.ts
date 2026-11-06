// Validation of IPv4 form fields (format only: never whether a setting is "right" for the network,
// so exercises do not give their answers away).
import type { LocalizedMessage } from '../../../domain/Messages'
import { Ipv4 } from '../../../engine'
import { localizedMessage } from '../../../i18n/messageKeys'
import type { FieldErrors } from './formTypes'

export class Ipv4Fields {
  /** Blank is fine unless `required`; otherwise a dotted-quad address. */
  static address(text: string, required: boolean): LocalizedMessage | undefined {
    const value = text.trim()
    if (value === '') return required ? localizedMessage('deviceConfig:errors.addressRequired') : undefined
    return Ipv4.isValid(value) ? undefined : localizedMessage('deviceConfig:errors.invalidAddress')
  }

  /** Contiguous mask; `allowZero` accepts 0.0.0.0 (the default route). */
  static mask(text: string, required: boolean, allowZero = false): LocalizedMessage | undefined {
    const value = text.trim()
    if (value === '') return required ? localizedMessage('deviceConfig:errors.maskRequired') : undefined
    const valid = allowZero ? Ipv4.prefixLength(value) !== null : Ipv4.isValidMask(value)
    return valid ? undefined : localizedMessage('deviceConfig:errors.invalidMask')
  }

  /**
   * Address and mask of a NIC or interface: both blank (= no address) unless `required`; otherwise
   * both valid, and the address is neither the network nor the broadcast address of its subnet.
   */
  static interfaceAddress(address: string, mask: string, required: boolean): FieldErrors<'address' | 'mask'> {
    const ip = address.trim()
    const netmask = mask.trim()
    if (!required && ip === '' && netmask === '') return {}
    const errors: FieldErrors<'address' | 'mask'> = {}
    const addressError = Ipv4Fields.address(ip, true)
    const maskError = Ipv4Fields.mask(netmask, true)
    if (addressError) errors.address = addressError
    if (maskError) errors.mask = maskError
    if (!addressError && !maskError && !Ipv4.isHostAddress(ip, netmask)) {
      errors.address = localizedMessage('deviceConfig:errors.notHostAddress')
    }
    return errors
  }

  /** Network address of `prefix` under `mask` (0.0.0.0 allowed), or null when either is invalid. */
  static networkOf(prefix: string, mask: string): string | null {
    const length = Ipv4.prefixLength(mask.trim())
    if (length === null || !Ipv4.isValid(prefix.trim())) return null
    if (length === 0) return '0.0.0.0'
    const network = Ipv4.network(prefix.trim(), mask.trim())
    return network === null ? null : Ipv4.format(network)
  }

  /** Error when `prefix` is not the network address of its subnet (IOS: "Inconsistent address and mask"). */
  static networkAddress(prefix: string, mask: string): LocalizedMessage | undefined {
    const network = Ipv4Fields.networkOf(prefix, mask)
    if (network === null || network === prefix.trim()) return undefined
    return localizedMessage('deviceConfig:errors.prefixNotNetwork', { network })
  }

  /** Negative when a < b, 0 when equal; both must be valid addresses. */
  static compare(a: string, b: string): number {
    return (Ipv4.parse(a) ?? 0) - (Ipv4.parse(b) ?? 0)
  }
}
