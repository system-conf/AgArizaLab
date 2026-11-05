import { AppWindow, Cable, EthernetPort, Network, Power, Router } from 'lucide-react'
import type { Device, Link, NetworkState } from '../../domain/NetworkTypes'
import AppLinkSettings from './AppLinkSettings'
import { connectedPortIdsOf } from './deviceLinks'
import HostSettingsForm from './HostSettingsForm'
import LinkToggles from './LinkToggles'
import PowerToggle from './PowerToggle'
import RouterDetails from './RouterDetails'
import SavedBadge from './SavedBadge'
import SettingsSection from './SettingsSection'
import SwitchPortsTable from './SwitchPortsTable'
import { useSavedFlash } from './useSavedFlash'

interface SettingsTabProps {
  device: Device
  state: NetworkState
  onUpdateDevice: (next: Device) => void
  onUpdateLink: (next: Link) => void
}

type SavedGroup = 'ip' | 'appLinks' | 'ports'

/** "Ayarlar" tab: every setting the player may change on the selected device, grouped in cards. */
function SettingsTab({ device, state, onUpdateDevice, onUpdateLink }: SettingsTabProps) {
  const { host, switchPorts, appLinks } = device
  const { savedKey, markSaved } = useSavedFlash<SavedGroup>()

  // Forms remount after a save (their key includes the saved values), so the
  // confirmation lives here, outside the forms.
  const saveFrom = (group: SavedGroup) => (next: Device) => {
    onUpdateDevice(next)
    markSaved(group)
  }

  return (
    <div className="flex flex-col gap-3">
      {device.kind !== 'internet' && (
        <SettingsSection title="Güç" icon={Power}>
          <PowerToggle device={device} onUpdateDevice={onUpdateDevice} />
        </SettingsSection>
      )}
      {host && (
        <SettingsSection title="IP ayarları" icon={Network} status={<SavedBadge visible={savedKey === 'ip'} />}>
          {/* Remount when the config changes outside the form (e.g. ipconfig /renew). */}
          <HostSettingsForm key={`${device.id}|${JSON.stringify(host)}`} device={device} host={host} onUpdateDevice={saveFrom('ip')} />
        </SettingsSection>
      )}
      {appLinks && appLinks.length > 0 && (
        <SettingsSection title="Uygulama bağlantıları" icon={AppWindow} status={<SavedBadge visible={savedKey === 'appLinks'} />}>
          <AppLinkSettings key={`${device.id}|${JSON.stringify(appLinks)}`} device={device} appLinks={appLinks} onUpdateDevice={saveFrom('appLinks')} />
        </SettingsSection>
      )}
      {switchPorts && (
        <SettingsSection title="Portlar" icon={EthernetPort} status={<SavedBadge visible={savedKey === 'ports'} />}>
          <SwitchPortsTable
            key={`${device.id}|${JSON.stringify(switchPorts)}`}
            device={device}
            ports={switchPorts}
            connectedPortIds={connectedPortIdsOf(state, device.id)}
            onUpdateDevice={saveFrom('ports')}
          />
        </SettingsSection>
      )}
      {device.kind === 'router' && (
        <SettingsSection title="Router" icon={Router}>
          <RouterDetails device={device} />
        </SettingsSection>
      )}
      <SettingsSection title="Kablolar" icon={Cable}>
        <LinkToggles deviceId={device.id} state={state} onUpdateLink={onUpdateLink} />
      </SettingsSection>
    </div>
  )
}

export default SettingsTab
