import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import type { SwitchPort } from '../../domain/NetworkTypes'
import { focusRing } from '../shared/focusRing'

interface SwitchPortStripProps {
  ports: SwitchPort[]
  /** Ports with a plugged-in cable. */
  connectedPortIds: ReadonlySet<string>
  selectedPortId?: string
  /** When given, ports are buttons that select the port for editing. */
  onSelectPort?: (portId: string) => void
}

// Colour shows the configured VLAN number only (a setting), never whether it is "correct".
const vlanColors = [
  'bg-sky-100 text-sky-900 ring-sky-300',
  'bg-violet-100 text-violet-900 ring-violet-300',
  'bg-teal-100 text-teal-900 ring-teal-300',
  'bg-amber-100 text-amber-900 ring-amber-300',
  'bg-pink-100 text-pink-900 ring-pink-300',
]

function colorOf(port: SwitchPort): string {
  if (!port.enabled) return 'bg-slate-500 text-slate-300 ring-slate-600 opacity-60'
  if (port.mode === 'trunk') return 'bg-slate-700 text-white ring-slate-800'
  return vlanColors[port.vlan % vlanColors.length] ?? 'bg-sky-100 text-sky-900 ring-sky-300'
}

/** 'Fa0/3' → '3'. */
function shortName(portId: string): string {
  const parts = portId.split('/')
  return parts[parts.length - 1] ?? portId
}

/** Screen-reader / tooltip text, e.g. 'Fa0/3: VLAN 10, enabled, cable plugged in, PoE'. */
function describe(t: TFunction<'device'>, port: SwitchPort, connected: boolean): string {
  const details = [
    port.mode === 'trunk' ? t('portStrip.trunk') : t('vlanNumber', { vlan: port.vlan }),
    port.enabled ? t('portStrip.enabled') : t('portStrip.disabled'),
    connected ? t('portStrip.linkUp') : t('portStrip.noCable'),
  ]
  if (port.poe) details.push(t('portStrip.poe'))
  return t('portStrip.description', { port: port.id, details: details.join(', ') })
}

function faceClassOf(port: SwitchPort, selected: boolean): string {
  const outline = selected ? 'outline-2 outline-offset-1 outline-white' : ''
  return `relative flex aspect-square w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded ring-1 ${colorOf(port)} ${outline}`
}

/** Front panel of a switch: one small square per port with its VLAN number. */
function SwitchPortStrip({ ports, connectedPortIds, selectedPortId, onSelectPort }: SwitchPortStripProps) {
  const { t } = useTranslation('device')
  return (
    <div className="flex flex-col gap-2">
      <ul aria-label={t('portStrip.label')} className="grid grid-cols-8 gap-1 rounded-lg bg-slate-800 p-1.5">
        {ports.map((port) => {
          const connected = connectedPortIds.has(port.id)
          const selected = port.id === selectedPortId
          const label = describe(t, port, connected)
          const face = (
            <>
              <span className="text-[10px] leading-none opacity-75">{shortName(port.id)}</span>
              <span className="font-mono text-xs font-semibold leading-none">
                {port.mode === 'trunk' ? 'T' : port.vlan}
              </span>
              {connected && (
                <span className="absolute end-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-white" />
              )}
            </>
          )
          const faceClass = faceClassOf(port, selected)
          return (
            <li key={port.id} className="min-w-0">
              {onSelectPort ? (
                <button
                  type="button"
                  title={label}
                  aria-label={t('portStrip.selectToEdit', { description: label })}
                  aria-pressed={selected}
                  onClick={() => onSelectPort(port.id)}
                  className={`${faceClass} hover:brightness-95 ${focusRing} focus-visible:outline-white`}
                >
                  {face}
                </button>
              ) : (
                <span title={label} className={faceClass}>
                  <span className="sr-only">{label}</span>
                  <span aria-hidden="true" className="contents">
                    {face}
                  </span>
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span>{t('portStrip.legend.number')}</span>
        <span>{t('portStrip.legend.trunk')}</span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> {t('portStrip.legend.linkUp')}
        </span>
        <span>{t('portStrip.legend.dimmed')}</span>
      </p>
    </div>
  )
}

export default SwitchPortStrip
