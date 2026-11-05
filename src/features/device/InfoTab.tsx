import type { TFunction } from 'i18next'
import { AppWindow, Cable, EthernetPort, Info, Network, Wifi } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AppLinkStatus } from '../../domain/EngineContract'
import type { Device, HostNetworkConfig, NetworkState } from '../../domain/NetworkTypes'
import AppLinkStatusList from './AppLinkStatusList'
import { connectedPortIdsOf, linksOfDevice, type DeviceLinkView } from './deviceLinks'
import { deviceKindKeys } from './deviceKindLabels'
import FactList, { type Fact } from './FactList'
import SettingsSection from './SettingsSection'
import SwitchPortStrip from './SwitchPortStrip'
import WirelessNetworksList from './WirelessNetworksList'

interface InfoTabProps {
  device: Device
  state: NetworkState
  appLinkStatuses: AppLinkStatus[]
}

type DeviceT = TFunction<'device'>

/** VLAN text for the switch port on either end of the link, if there is one. */
function vlanText(t: DeviceT, device: Device, view: DeviceLinkView): string | undefined {
  const switchSide =
    device.kind === 'switch' ? { sw: device, portId: view.ownPortId } :
    view.peer?.kind === 'switch' ? { sw: view.peer, portId: view.peerPortId } :
    undefined
  const port = switchSide?.sw.switchPorts?.find((p) => p.id === switchSide.portId)
  if (!port) return undefined
  return port.mode === 'trunk' ? t('links.trunkAllVlans') : t('vlanNumber', { vlan: port.vlan })
}

/** "Wireless (SSID) · associated", "Wired · unplugged", … plus the VLAN when known. */
function linkStatusText(t: DeviceT, device: Device, view: DeviceLinkView): string {
  const { ssid, connected } = view.link
  const status =
    ssid !== undefined
      ? connected ? t('links.wirelessConnected', { ssid }) : t('links.wirelessDisconnected', { ssid })
      : connected ? t('links.wiredConnected') : t('links.wiredDisconnected')
  const vlan = vlanText(t, device, view)
  return vlan === undefined ? status : `${status} · ${vlan}`
}

function orDash(value: string): string {
  return value === '' ? '—' : value
}

function generalFacts(t: DeviceT, device: Device): Fact[] {
  const facts: Fact[] = [
    { label: t('facts.kind'), value: t(deviceKindKeys[device.kind]) },
    { label: t('facts.power'), value: device.powered ? t('power.on') : t('power.off') },
  ]
  if (device.kind !== 'internet') facts.push({ label: t('facts.mac'), value: device.mac, mono: true })
  return facts
}

function ipFacts(t: DeviceT, host: HostNetworkConfig): Fact[] {
  return [
    { label: t('facts.mode'), value: host.mode === 'dhcp' ? t('ipMode.dhcp') : t('ipMode.static') },
    { label: t('facts.ip'), value: orDash(host.ip), mono: true },
    { label: t('facts.mask'), value: orDash(host.mask), mono: true },
    { label: t('facts.gateway'), value: orDash(host.gateway), mono: true },
    { label: t('facts.dns'), value: host.dns.length > 0 ? host.dns.join(', ') : '—', mono: true },
  ]
}

/** "Info" tab: read-only facts about the selected device, as cards. */
function InfoTab({ device, state, appLinkStatuses }: InfoTabProps) {
  const { t } = useTranslation('device')
  const { host } = device
  const links = linksOfDevice(state, device.id)

  return (
    <div className="flex flex-col gap-3">
      <SettingsSection title={t('sections.general')} icon={Info}>
        <FactList facts={generalFacts(t, device)} />
      </SettingsSection>
      {host && (
        <SettingsSection title={t('sections.ipInfo')} icon={Network}>
          <FactList facts={ipFacts(t, host)} />
        </SettingsSection>
      )}
      {device.switchPorts && (
        <SettingsSection title={t('sections.ports')} icon={EthernetPort}>
          <SwitchPortStrip ports={device.switchPorts} connectedPortIds={connectedPortIdsOf(state, device.id)} />
        </SettingsSection>
      )}
      {appLinkStatuses.length > 0 && (
        <SettingsSection title={t('sections.appLinks')} icon={AppWindow}>
          <AppLinkStatusList statuses={appLinkStatuses} />
        </SettingsSection>
      )}
      {device.wirelessNetworks && (
        <SettingsSection title={t('sections.wirelessNetworks')} icon={Wifi}>
          <WirelessNetworksList networks={device.wirelessNetworks} />
        </SettingsSection>
      )}
      <SettingsSection title={t('sections.links')} icon={Cable}>
        {links.length === 0 && <p className="text-sm text-slate-500">{t('links.noneConnected')}</p>}
        <ul className="flex flex-col gap-1.5 text-sm">
          {links.map((view) => (
            <li key={view.link.id} className="rounded-lg bg-slate-50 px-2.5 py-2">
              <span className="font-mono">{view.ownPortId}</span> → {view.peer?.name ?? t('links.unknownDevice')}{' '}
              <span className="font-mono text-slate-500">({view.peerPortId})</span>
              <span className="block text-xs text-slate-500">{linkStatusText(t, device, view)}</span>
            </li>
          ))}
        </ul>
      </SettingsSection>
    </div>
  )
}

export default InfoTab
