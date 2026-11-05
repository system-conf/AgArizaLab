import { AppWindow, Cable, EthernetPort, Network, Power, Router } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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

/** "Settings" tab: every setting the learner may change on the selected device, grouped in cards. */
function SettingsTab({ device, state, onUpdateDevice, onUpdateLink }: SettingsTabProps) {
  const { host, switchPorts, appLinks } = device
  const { t } = useTranslation('device')
  const { savedKey, markSaved } = useSavedFlash<SavedGroup>()

  // Forms remount after a save (their key includes the saved values), so the
  // confirmation lives here, outside the forms.
  const saveFrom = (group: SavedGroup) => (next: Device) => {
    onUpdateDevice(next)
    markSaved(group)
  }
  const saveIp = saveFrom('ip')
  const saveAppLinks = saveFrom('appLinks')
  const savePorts = saveFrom('ports')

  return (
    <div className="flex flex-col gap-3">
      {device.kind !== 'internet' && (
        <SettingsSection title={t('sections.power')} icon={Power}>
          <PowerToggle device={device} onUpdateDevice={onUpdateDevice} />
        </SettingsSection>
      )}
      {host && (
        <SettingsSection title={t('sections.ipSettings')} icon={Network} status={<SavedBadge visible={savedKey === 'ip'} />}>
          {/* Remount when the config changes outside the form (e.g. ipconfig /renew). */}
          <HostSettingsForm key={`${device.id}|${JSON.stringify(host)}`} device={device} host={host} onUpdateDevice={saveIp} />
        </SettingsSection>
      )}
      {appLinks && appLinks.length > 0 && (
        <SettingsSection title={t('sections.appLinks')} icon={AppWindow} status={<SavedBadge visible={savedKey === 'appLinks'} />}>
          <AppLinkSettings key={`${device.id}|${JSON.stringify(appLinks)}`} device={device} appLinks={appLinks} onUpdateDevice={saveAppLinks} />
        </SettingsSection>
      )}
      {switchPorts && (
        <SettingsSection title={t('sections.ports')} icon={EthernetPort} status={<SavedBadge visible={savedKey === 'ports'} />}>
          <SwitchPortsTable
            key={`${device.id}|${JSON.stringify(switchPorts)}`}
            device={device}
            ports={switchPorts}
            connectedPortIds={connectedPortIdsOf(state, device.id)}
            onUpdateDevice={savePorts}
          />
        </SettingsSection>
      )}
      {device.kind === 'router' && (
        <SettingsSection title={t('sections.router')} icon={Router}>
          <RouterDetails device={device} />
        </SettingsSection>
      )}
      <SettingsSection title={t('sections.cables')} icon={Cable}>
        <LinkToggles deviceId={device.id} state={state} onUpdateLink={onUpdateLink} />
      </SettingsSection>
    </div>
  )
}

export default SettingsTab
