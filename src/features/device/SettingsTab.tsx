import type { Device, Link, NetworkState } from '../../domain/NetworkTypes'
import AppLinkSettings from './AppLinkSettings'
import HostSettingsForm from './HostSettingsForm'
import LinkToggles from './LinkToggles'
import PowerToggle from './PowerToggle'
import RouterDetails from './RouterDetails'
import SettingsSection from './SettingsSection'
import SwitchPortsTable from './SwitchPortsTable'

interface SettingsTabProps {
  device: Device
  state: NetworkState
  onUpdateDevice: (next: Device) => void
  onUpdateLink: (next: Link) => void
}

/** "Ayarlar" tab: every setting the player may change on the selected device. */
function SettingsTab({ device, state, onUpdateDevice, onUpdateLink }: SettingsTabProps) {
  const { host, switchPorts, appLinks } = device

  return (
    <div className="flex flex-col gap-4">
      {device.kind !== 'internet' && (
        <SettingsSection title="Güç">
          <PowerToggle device={device} onUpdateDevice={onUpdateDevice} />
        </SettingsSection>
      )}
      {host && (
        <SettingsSection title="IP ayarları">
          {/* Remount when the config changes outside the form (e.g. ipconfig /renew). */}
          <HostSettingsForm key={`${device.id}|${JSON.stringify(host)}`} device={device} host={host} onUpdateDevice={onUpdateDevice} />
        </SettingsSection>
      )}
      {appLinks && appLinks.length > 0 && (
        <SettingsSection title="Uygulama bağlantıları">
          <AppLinkSettings key={`${device.id}|${JSON.stringify(appLinks)}`} device={device} appLinks={appLinks} onUpdateDevice={onUpdateDevice} />
        </SettingsSection>
      )}
      {switchPorts && (
        <SettingsSection title="Portlar">
          <SwitchPortsTable key={`${device.id}|${JSON.stringify(switchPorts)}`} device={device} ports={switchPorts} onUpdateDevice={onUpdateDevice} />
        </SettingsSection>
      )}
      {device.kind === 'router' && (
        <SettingsSection title="Router">
          <RouterDetails device={device} />
        </SettingsSection>
      )}
      <SettingsSection title="Kablolar">
        <LinkToggles deviceId={device.id} state={state} onUpdateLink={onUpdateLink} />
      </SettingsSection>
    </div>
  )
}

export default SettingsTab
