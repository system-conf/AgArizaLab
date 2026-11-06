import type { TFunction } from 'i18next'
import { Ipv4 } from '../../../engine'
import type { AddressSummary } from '../model/DeviceInfoModel'

/** '192.168.1.1/24'; an invalid mask is shown as typed ('192.168.1.1 255.0.255.0'). */
export function cidrText(address: string, mask: string): string {
  const length = Ipv4.prefixLength(mask)
  return length === null ? `${address} ${mask}`.trim() : `${address}/${length}`
}

/** Address of an interface or NIC for the info panel. */
export function addressText(t: TFunction<'deviceConfig'>, ipv4: AddressSummary): string {
  if (ipv4.address === '') return ipv4.addressing === 'dhcp' ? t('info.dhcpWaiting') : t('info.noAddress')
  const text = cidrText(ipv4.address, ipv4.mask)
  return ipv4.addressing === 'dhcp' ? t('info.dhcpAddress', { address: text }) : text
}
