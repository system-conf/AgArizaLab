import { AppWindow, Cable, EthernetPort, Info, Network, Wifi } from 'lucide-react'
import type { AppLinkStatus } from '../../domain/EngineContract'
import type { Device, NetworkState } from '../../domain/NetworkTypes'
import AppLinkStatusList from './AppLinkStatusList'
import { connectedPortIdsOf, linksOfDevice, type DeviceLinkView } from './deviceLinks'
import { deviceKindLabels } from './deviceKindLabels'
import FactList, { type Fact } from './FactList'
import SettingsSection from './SettingsSection'
import SwitchPortStrip from './SwitchPortStrip'
import WirelessNetworksList from './WirelessNetworksList'

interface InfoTabProps {
  device: Device
  state: NetworkState
  appLinkStatuses: AppLinkStatus[]
}

/** VLAN text for the switch port on either end of the link, if there is one. */
function vlanText(device: Device, view: DeviceLinkView): string | undefined {
  const switchSide =
    device.kind === 'switch' ? { sw: device, portId: view.ownPortId } :
    view.peer?.kind === 'switch' ? { sw: view.peer, portId: view.peerPortId } :
    undefined
  const port = switchSide?.sw.switchPorts?.find((p) => p.id === switchSide.portId)
  if (!port) return undefined
  return port.mode === 'trunk' ? 'trunk (tüm VLAN’lar)' : `VLAN ${port.vlan}`
}

function orDash(value: string): string {
  return value === '' ? '—' : value
}

function generalFacts(device: Device): Fact[] {
  const facts: Fact[] = [
    { label: 'Tür', value: deviceKindLabels[device.kind] },
    { label: 'Güç', value: device.powered ? 'Açık' : 'Kapalı' },
  ]
  if (device.kind !== 'internet') facts.push({ label: 'MAC adresi', value: device.mac, mono: true })
  return facts
}

/** "Bilgi" tab: read-only facts about the selected device, as cards. */
function InfoTab({ device, state, appLinkStatuses }: InfoTabProps) {
  const { host } = device
  const links = linksOfDevice(state, device.id)

  return (
    <div className="flex flex-col gap-3">
      <SettingsSection title="Genel" icon={Info}>
        <FactList facts={generalFacts(device)} />
      </SettingsSection>
      {host && (
        <SettingsSection title="IP bilgileri" icon={Network}>
          <FactList
            facts={[
              { label: 'Mod', value: host.mode === 'dhcp' ? 'Otomatik (DHCP)' : 'Elle (statik)' },
              { label: 'IP adresi', value: orDash(host.ip), mono: true },
              { label: 'Maske', value: orDash(host.mask), mono: true },
              { label: 'Ağ geçidi', value: orDash(host.gateway), mono: true },
              { label: 'DNS', value: host.dns.length > 0 ? host.dns.join(', ') : '—', mono: true },
            ]}
          />
        </SettingsSection>
      )}
      {device.switchPorts && (
        <SettingsSection title="Portlar" icon={EthernetPort}>
          <SwitchPortStrip ports={device.switchPorts} connectedPortIds={connectedPortIdsOf(state, device.id)} />
        </SettingsSection>
      )}
      {appLinkStatuses.length > 0 && (
        <SettingsSection title="Uygulama bağlantıları" icon={AppWindow}>
          <AppLinkStatusList statuses={appLinkStatuses} />
        </SettingsSection>
      )}
      {device.wirelessNetworks && (
        <SettingsSection title="Kablosuz ağlar" icon={Wifi}>
          <WirelessNetworksList networks={device.wirelessNetworks} />
        </SettingsSection>
      )}
      <SettingsSection title="Bağlantılar" icon={Cable}>
        {links.length === 0 && <p className="text-sm text-slate-500">Bağlı kablo yok.</p>}
        <ul className="flex flex-col gap-1.5 text-sm">
          {links.map((view) => {
            const vlan = vlanText(device, view)
            return (
              <li key={view.link.id} className="rounded-lg bg-slate-50 px-2.5 py-2">
                <span className="font-mono">{view.ownPortId}</span> → {view.peer?.name ?? 'Bilinmeyen cihaz'}{' '}
                <span className="font-mono text-slate-500">({view.peerPortId})</span>
                <span className="block text-xs text-slate-500">
                  {view.link.ssid !== undefined
                    ? `Kablosuz (${view.link.ssid}) · ${view.link.connected ? 'bağlı' : 'bağlı değil'}`
                    : `Kablolu · ${view.link.connected ? 'takılı' : 'takılı değil'}`}
                  {vlan && ` · ${vlan}`}
                </span>
              </li>
            )
          })}
        </ul>
      </SettingsSection>
    </div>
  )
}

export default InfoTab
