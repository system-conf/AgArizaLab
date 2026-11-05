import { useRef, useState, type FormEvent } from 'react'
import type { Device, SwitchPort, SwitchPortMode } from '../../domain/NetworkTypes'
import { focusRing } from '../shared/focusRing'
import SwitchPortStrip from './SwitchPortStrip'

interface SwitchPortsTableProps {
  device: Device
  ports: SwitchPort[]
  onUpdateDevice: (next: Device) => void
  /** Ports with a plugged-in cable, shown on the port strip. */
  connectedPortIds?: ReadonlySet<string>
}

const noPorts: ReadonlySet<string> = new Set()

interface PortDraft {
  id: string
  vlanText: string
  mode: SwitchPortMode
  enabled: boolean
}

function isValidVlan(text: string): boolean {
  if (!/^\d{1,4}$/.test(text.trim())) return false
  const vlan = Number(text)
  return vlan >= 1 && vlan <= 4094
}

/**
 * Editable port table of a switch. Parent should remount it (via `key`) when the
 * ports change from outside.
 */
function SwitchPortsTable({ device, ports, onUpdateDevice, connectedPortIds = noPorts }: SwitchPortsTableProps) {
  const [drafts, setDrafts] = useState<PortDraft[]>(() =>
    ports.map((port) => ({ id: port.id, vlanText: String(port.vlan), mode: port.mode, enabled: port.enabled })),
  )
  const [selectedPortId, setSelectedPortId] = useState<string | undefined>(undefined)
  // Mode selects by port id, so a click on the port strip can jump to that row.
  const modeSelects = useRef(new Map<string, HTMLSelectElement>())

  function selectPort(portId: string) {
    setSelectedPortId(portId)
    const select = modeSelects.current.get(portId)
    if (select) {
      select.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      select.focus({ preventScroll: true })
    }
  }
  const invalidIds = drafts.filter((d) => d.mode === 'access' && !isValidVlan(d.vlanText)).map((d) => d.id)

  function updateDraft(id: string, change: Partial<PortDraft>) {
    setDrafts((current) => current.map((d) => (d.id === id ? { ...d, ...change } : d)))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (invalidIds.length > 0) return
    const nextPorts = ports.map((port) => {
      const draft = drafts.find((d) => d.id === port.id)
      if (!draft) return port
      // A trunk ignores the access VLAN; keep the old number when the text is not valid.
      const vlan = isValidVlan(draft.vlanText) ? Number(draft.vlanText) : port.vlan
      return { ...port, vlan, mode: draft.mode, enabled: draft.enabled }
    })
    onUpdateDevice({ ...device, switchPorts: nextPorts })
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <SwitchPortStrip
        ports={ports}
        connectedPortIds={connectedPortIds}
        selectedPortId={selectedPortId}
        onSelectPort={selectPort}
      />
      <p className="text-xs text-slate-500">Bir porta tıkla, aşağıdaki tabloda o satır seçilsin.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Switch portları</caption>
          <thead className="text-xs text-slate-500">
            <tr>
              <th scope="col" className="py-1 pr-2 font-medium">Port</th>
              <th scope="col" className="py-1 pr-2 font-medium">Mod</th>
              <th scope="col" className="py-1 pr-2 font-medium">VLAN</th>
              <th scope="col" className="py-1 pr-2 font-medium">Açık</th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((draft) => {
              const invalid = invalidIds.includes(draft.id)
              const poe = ports.find((port) => port.id === draft.id)?.poe ?? false
              return (
                <tr
                  key={draft.id}
                  className={`border-t border-slate-100 ${draft.id === selectedPortId ? 'bg-sky-50' : ''}`}
                >
                  <th scope="row" className="py-1.5 pr-2 font-mono font-normal">
                    {draft.id}
                    {poe && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">PoE</span>}
                  </th>
                  <td className="py-1.5 pr-2">
                    <select
                      ref={(element) => {
                        if (element) modeSelects.current.set(draft.id, element)
                        else modeSelects.current.delete(draft.id)
                      }}
                      aria-label={`${draft.id} modu`}
                      value={draft.mode}
                      onChange={(e) => updateDraft(draft.id, { mode: e.target.value === 'trunk' ? 'trunk' : 'access' })}
                      className={`rounded border border-slate-300 bg-white px-1 py-1 ${focusRing}`}
                    >
                      <option value="access">access</option>
                      <option value="trunk">trunk</option>
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      type="number"
                      min={1}
                      max={4094}
                      aria-label={`${draft.id} VLAN numarası`}
                      aria-invalid={invalid ? true : undefined}
                      disabled={draft.mode === 'trunk'}
                      value={draft.mode === 'trunk' ? '' : draft.vlanText}
                      placeholder={draft.mode === 'trunk' ? 'hepsi' : undefined}
                      onChange={(e) => updateDraft(draft.id, { vlanText: e.target.value })}
                      className={`w-20 rounded border px-1 py-1 font-mono disabled:bg-slate-100 ${
                        invalid ? 'border-rose-400' : 'border-slate-300'
                      } ${focusRing}`}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      type="checkbox"
                      aria-label={`${draft.id} açık`}
                      checked={draft.enabled}
                      onChange={(e) => updateDraft(draft.id, { enabled: e.target.checked })}
                      className={`h-4 w-4 accent-sky-700 ${focusRing}`}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {invalidIds.length > 0 && (
        <p className="text-xs text-rose-700" role="alert">
          VLAN numarası 1 ile 4094 arasında olmalı: {invalidIds.join(', ')}
        </p>
      )}
      <button
        type="submit"
        disabled={invalidIds.length > 0}
        className={`self-start rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:bg-slate-300 ${focusRing}`}
      >
        Port ayarlarını kaydet
      </button>
    </form>
  )
}

export default SwitchPortsTable
