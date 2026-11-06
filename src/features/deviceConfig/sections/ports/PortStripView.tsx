import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { PortStrip } from '../../../../catalog'
import type { Device, DeviceModel, NetworkState, Port } from '../../../../domain'
import { useMessageTranslator } from '../../../../i18n'
import { focusRing } from '../../../shared/focusRing'
import type { ConfigLocks } from '../../model/ConfigLocks'
import { DeviceInfoModel, type PortLight } from '../../model/DeviceInfoModel'

interface PortStripViewProps {
  device: Device
  state: NetworkState
  model: DeviceModel | undefined
  locks: ConfigLocks
  selectedPortId: string | null
  onSelect: (portId: string) => void
}

// Colour shows the configured access VLAN only (a setting), never whether it is "correct".
const vlanColors = [
  'bg-sky-100 text-sky-900 ring-sky-300',
  'bg-violet-100 text-violet-900 ring-violet-300',
  'bg-teal-100 text-teal-900 ring-teal-300',
  'bg-amber-100 text-amber-900 ring-amber-300',
  'bg-pink-100 text-pink-900 ring-pink-300',
]
const neutralFace = 'bg-slate-200 text-slate-900 ring-slate-400'

/** Ids that fit on the face stay whole ('Gi0/0', 'eth0'); long ones show their last number ('Gi1/0/12' → '12'). */
function shortName(portId: string): string {
  return portId.length <= 6 || !portId.includes('/') ? portId : (portId.split('/').pop() ?? portId)
}

/** Second line of the port face: access VLAN or 'T' for trunks; nothing for hidden or non-switch ports. */
function badgeOf(port: Port, visible: boolean): string {
  if (!visible || port.role !== 'switched') return ''
  return port.l2.mode === 'trunk' ? 'T' : String(port.l2.accessVlan)
}

function faceColor(port: Port, visible: boolean): string {
  if (!visible) return neutralFace
  if (!port.adminUp) return 'bg-slate-500 text-slate-200 ring-slate-600 opacity-60'
  if (port.role !== 'switched') return neutralFace
  if (port.l2.mode === 'trunk') return 'bg-slate-700 text-white ring-slate-800'
  return vlanColors[port.l2.accessVlan % vlanColors.length] ?? neutralFace
}

const lightKeys = { up: 'ports.linkUp', down: 'ports.linkDown', noCable: 'ports.noCable', unplugged: 'ports.unplugged' } as const

/** Screen-reader / tooltip text, e.g. 'Fa0/3: VLAN 10, link up'. */
function describe(t: TFunction<'deviceConfig'>, port: Port, visible: boolean, light: PortLight): string {
  const details: string[] = []
  if (!visible) details.push(t('ports.settingsHidden'))
  else {
    if (port.role === 'switched') details.push(port.l2.mode === 'trunk' ? t('ports.trunk') : t('ports.vlan', { vlan: port.l2.accessVlan }))
    if (!port.adminUp) details.push(t('ports.shutDown'))
  }
  details.push(t(lightKeys[light]))
  return t('ports.portButton', { port: port.id, details: details.join(', ') })
}

/** Front panel of the device (catalog PortStrip layout): one button per port, grouped like the real box. */
function PortStripView({ device, state, model, locks, selectedPortId, onSelect }: PortStripViewProps) {
  const { t } = useTranslation('deviceConfig')
  const translate = useMessageTranslator()
  const layout = PortStrip.forDevice(device, model)
  const portsById = new Map(device.ports.map((port) => [port.id, port]))
  const hasSwitchports = device.ports.some((port) => port.role === 'switched')

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label={t('ports.stripLabel', { device: device.name })} className="flex flex-col gap-2 rounded-lg bg-slate-800 p-2">
        {layout.sections.map((section) => (
          <div key={section.group} className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-300">{translate({ key: section.labelKey })}</span>
            <div className="flex flex-col gap-1 overflow-x-auto pb-1">
              {section.rows.map((row, rowIndex) => (
                <ul key={rowIndex} className="flex gap-1">
                  {row.map((portId) => {
                    const port = portsById.get(portId)
                    if (!port) return null
                    const visible = locks.port(portId) !== 'hidden'
                    const { light } = DeviceInfoModel.portStatus(state, device, portId)
                    const selected = portId === selectedPortId
                    const label = describe(t, port, visible, light)
                    return (
                      <li key={portId} className="shrink-0">
                        <button
                          type="button"
                          title={label}
                          aria-label={label}
                          aria-pressed={selected}
                          onClick={() => onSelect(portId)}
                          className={`relative flex h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded px-1 ring-1 hover:brightness-95 ${faceColor(port, visible)} ${
                            selected ? 'outline-2 outline-offset-1 outline-white' : ''
                          } ${focusRing} focus-visible:outline-white`}
                        >
                          <span className="font-mono text-[10px] leading-none">{shortName(portId)}</span>
                          <span className="font-mono text-xs font-semibold leading-none">{badgeOf(port, visible)}</span>
                          {light === 'up' && (
                            <span aria-hidden="true" className="absolute end-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-white" />
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {hasSwitchports && (
          <>
            <span>{t('ports.legend.number')}</span>
            <span>{t('ports.legend.trunk')}</span>
          </>
        )}
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> {t('ports.legend.linkUp')}
        </span>
        <span>{t('ports.legend.dimmed')}</span>
      </p>
    </div>
  )
}

export default PortStripView
