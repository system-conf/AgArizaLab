import { useId, useState } from 'react'
import type { AppLinkStatus, TerminalLine } from '../../domain/EngineContract'
import type { Device, Link, NetworkState } from '../../domain/NetworkTypes'
import { deviceIcons } from '../map/deviceIcons'
import { focusRing } from '../shared/focusRing'
import { deviceKindLabels } from './deviceKindLabels'
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

const tabs: { id: TabId; label: string }[] = [
  { id: 'info', label: 'Bilgi' },
  { id: 'settings', label: 'Ayarlar' },
  { id: 'terminal', label: 'Terminal' },
]

/** Right-hand panel for the selected device with Bilgi / Ayarlar / Terminal tabs. */
function DevicePanel(props: DevicePanelProps) {
  const { device, state, appLinkStatuses, terminalLines, onRunCommand, onUpdateDevice, onUpdateLink } = props
  const [activeTab, setActiveTab] = useState<TabId>('info')
  const baseId = useId()
  const Icon = deviceIcons[device.kind]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-50 text-sky-800">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-semibold text-slate-900">{device.name}</h2>
          <p className="text-xs text-slate-500">{deviceKindLabels[device.kind]}</p>
        </div>
      </div>
      <div role="tablist" aria-label="Cihaz sekmeleri" className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`${baseId}-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm ${
              activeTab === tab.id ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            } ${focusRing}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${baseId}-panel-${activeTab}`} aria-labelledby={`${baseId}-tab-${activeTab}`}>
        {activeTab === 'info' && <InfoTab device={device} state={state} appLinkStatuses={appLinkStatuses} />}
        {activeTab === 'settings' && (
          <SettingsTab device={device} state={state} onUpdateDevice={onUpdateDevice} onUpdateLink={onUpdateLink} />
        )}
        {activeTab === 'terminal' &&
          (device.host ? (
            <TerminalTab lines={terminalLines} onRunCommand={onRunCommand} />
          ) : (
            <p className="text-sm text-slate-500">
              Bu cihazda komut satırı yok. Terminal için bilgisayar, kasa gibi bir uç cihaz seçin.
            </p>
          ))}
      </div>
    </div>
  )
}

export default DevicePanel
