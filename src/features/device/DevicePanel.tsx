import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppLinkStatus, TerminalLine } from '../../domain/EngineContract'
import type { Device, Link, NetworkState } from '../../domain/NetworkTypes'
import { TerminalAvailability } from '../../engine'
import { focusRing } from '../shared/focusRing'
import DeviceHeader from './DeviceHeader'
import InfoTab from './InfoTab'
import SettingsTab from './SettingsTab'
import TerminalTab from './TerminalTab'

interface DevicePanelProps {
  device: Device
  state: NetworkState
  appLinkStatuses: AppLinkStatus[]
  terminalLines: TerminalLine[]
  onRunCommand: (line: string) => void
  onUpdateDevice: (next: Device) => void
  onUpdateLink: (next: Link) => void
}

type TabId = 'info' | 'settings' | 'terminal'

/** Tab ids with their label keys in the `device` namespace. */
const tabs = [
  { id: 'info', labelKey: 'tabs.info' },
  { id: 'settings', labelKey: 'tabs.settings' },
  { id: 'terminal', labelKey: 'tabs.terminal' },
] as const satisfies readonly { id: TabId; labelKey: `tabs.${TabId}` }[]

/** Right-hand panel for the selected device with Info / Settings / Terminal tabs. */
function DevicePanel(props: DevicePanelProps) {
  const { device, state, appLinkStatuses, terminalLines, onRunCommand, onUpdateDevice, onUpdateLink } = props
  const { t } = useTranslation('device')
  const [selectedTab, setSelectedTab] = useState<TabId>('info')
  // `cls` only hides older lines on screen; the session keeps its full history.
  const [clearedLineCount, setClearedLineCount] = useState(0)
  const baseId = useId()
  // Only PCs, POS terminals and the NVR have a command line; other devices get no Terminal tab.
  const hasTerminal = TerminalAvailability.isAvailable(device)
  const visibleTabs = hasTerminal ? tabs : tabs.filter((tab) => tab.id !== 'terminal')
  const activeTab: TabId = selectedTab === 'terminal' && !hasTerminal ? 'info' : selectedTab

  return (
    <div className="flex flex-col gap-3">
      <DeviceHeader device={device} />
      <div role="tablist" aria-label={t('tabs.listLabel')} className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`${baseId}-panel-${tab.id}`}
            onClick={() => setSelectedTab(tab.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm ${
              activeTab === tab.id ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            } ${focusRing}`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${baseId}-panel-${activeTab}`} aria-labelledby={`${baseId}-tab-${activeTab}`}>
        {activeTab === 'info' && <InfoTab device={device} state={state} appLinkStatuses={appLinkStatuses} />}
        {activeTab === 'settings' && (
          <SettingsTab device={device} state={state} onUpdateDevice={onUpdateDevice} onUpdateLink={onUpdateLink} />
        )}
        {activeTab === 'terminal' && hasTerminal && (
          <TerminalTab
            lines={terminalLines}
            hiddenLineCount={Math.min(clearedLineCount, terminalLines.length)}
            onRunCommand={onRunCommand}
            onClear={() => setClearedLineCount(terminalLines.length)}
          />
        )}
      </div>
    </div>
  )
}

export default DevicePanel
