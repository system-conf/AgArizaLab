import type { AppLinkStatus } from '../../domain/EngineContract'
import type { Device, NetworkState } from '../../domain/NetworkTypes'
import AppLinkStatusList from './AppLinkStatusList'
import { linksOfDevice, type DeviceLinkView } from './deviceLinks'
import { deviceKindLabels } from './deviceKindLabels'
import SettingsSection from './SettingsSection'
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

/** "Bilgi" tab: read-only facts about the selected device. */
function InfoTab({ device, state, appLinkStatuses }: InfoTabProps) {
  const { host } = device
  const links = linksOfDevice(state, device.id)

  return (
    <div className="flex flex-col gap-4 text-sm">
      <SettingsSection title="Genel">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-slate-500">Tür</dt>
          <dd>{deviceKindLabels[device.kind]}</dd>
          <dt className="text-slate-500">Güç</dt>
          <dd>{device.powered ? 'Açık' : 'Kapalı'}</dd>
          {device.kind !== 'internet' && (
            <>
              <dt className="text-slate-500">MAC adresi</dt>
              <dd className="font-mono">{device.mac}</dd>
            </>
          )}
        </dl>
      </SettingsSection>
      {host && (
        <SettingsSection title="IP bilgileri">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-slate-500">Mod</dt>
            <dd>{host.mode === 'dhcp' ? 'Otomatik (DHCP)' : 'Elle (statik)'}</dd>
            <dt className="text-slate-500">IP adresi</dt>
            <dd className="font-mono">{orDash(host.ip)}</dd>
            <dt className="text-slate-500">Maske</dt>
            <dd className="font-mono">{orDash(host.mask)}</dd>
            <dt className="text-slate-500">Ağ geçidi</dt>
            <dd className="font-mono">{orDash(host.gateway)}</dd>
            <dt className="text-slate-500">DNS</dt>
            <dd className="font-mono">{host.dns.length > 0 ? host.dns.join(', ') : '—'}</dd>
          </dl>
        </SettingsSection>
      )}
      {appLinkStatuses.length > 0 && (
        <SettingsSection title="Uygulama bağlantıları">
          <AppLinkStatusList statuses={appLinkStatuses} />
        </SettingsSection>
      )}
      {device.wirelessNetworks && (
        <SettingsSection title="Kablosuz ağlar">
          <WirelessNetworksList networks={device.wirelessNetworks} />
        </SettingsSection>
      )}
      <SettingsSection title="Bağlantılar">
        {links.length === 0 && <p className="text-slate-500">Bağlı kablo yok.</p>}
        <ul className="flex flex-col gap-1.5">
          {links.map((view) => {
            const vlan = vlanText(device, view)
            return (
              <li key={view.link.id} className="rounded-md bg-slate-50 px-2 py-1.5">
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
