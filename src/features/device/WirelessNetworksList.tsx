import { useTranslation } from 'react-i18next'
import type { WirelessNetwork } from '../../domain/NetworkTypes'

interface WirelessNetworksListProps {
  networks: WirelessNetwork[]
}

/** Read-only list of the SSIDs an access point broadcasts and their VLANs. */
function WirelessNetworksList({ networks }: WirelessNetworksListProps) {
  const { t } = useTranslation('device')
  if (networks.length === 0) {
    return <p className="text-sm text-slate-500">{t('wireless.none')}</p>
  }
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {networks.map((network) => (
        <li key={network.ssid} className="flex justify-between rounded-md bg-slate-50 px-2 py-1">
          <span className="font-medium">{network.ssid}</span>
          <span className="text-slate-500">{t('vlanNumber', { vlan: network.vlan })}</span>
        </li>
      ))}
    </ul>
  )
}

export default WirelessNetworksList
