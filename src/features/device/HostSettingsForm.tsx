import { useId, useState, type FormEvent } from 'react'
import type { Device, HostNetworkConfig } from '../../domain/NetworkTypes'
import { TerminalAvailability } from '../../engine'
import { focusRing } from '../shared/focusRing'
import { HostSettingsFormModel, type HostDraft } from './HostSettingsFormModel'
import TextField from './TextField'

interface HostSettingsFormProps {
  device: Device
  host: HostNetworkConfig
  onUpdateDevice: (next: Device) => void
}

/**
 * IP settings form of an end device. Parent should remount it (via `key`) when the
 * device's host config changes from outside, e.g. after 'ipconfig /renew'.
 */
function HostSettingsForm({ device, host, onUpdateDevice }: HostSettingsFormProps) {
  const [draft, setDraft] = useState<HostDraft>(() => HostSettingsFormModel.toDraft(host))
  const [submitted, setSubmitted] = useState(false)
  const modeId = useId()
  const errors = HostSettingsFormModel.validate(draft)
  const hasErrors = Object.keys(errors).length > 0
  // Format errors show while typing; "required" errors only after a save attempt.
  const shownErrors = submitted ? errors : HostSettingsFormModel.liveErrors(errors, draft)
  const isDhcp = draft.mode === 'dhcp'

  function setField(field: keyof HostDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    if (hasErrors) return
    onUpdateDevice({ ...device, host: HostSettingsFormModel.toHost(draft, host) })
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={modeId} className="text-sm font-medium text-slate-700">
          IP adresi alma şekli
        </label>
        <select
          id={modeId}
          value={draft.mode}
          onChange={(event) => setField('mode', event.target.value === 'dhcp' ? 'dhcp' : 'static')}
          className={`rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm ${focusRing}`}
        >
          <option value="dhcp">Otomatik (DHCP)</option>
          <option value="static">Elle (statik)</option>
        </select>
      </div>
      {isDhcp && (
        <p className="rounded-md bg-sky-50 p-2 text-xs text-sky-900">
          Adres bilgileri DHCP sunucusundan gelir.
          {/* Only devices with a terminal can ask for a new address themselves. */}
          {TerminalAvailability.isAvailable(device) && (
            <>
              {' '}Yeni adres almak için Terminal sekmesinde
              <span className="font-mono"> ipconfig /renew </span>yazın.
            </>
          )}
        </p>
      )}
      <TextField label="IP adresi" value={draft.ip} onChange={(v) => setField('ip', v)} error={shownErrors.ip} disabled={isDhcp} />
      <TextField label="Alt ağ maskesi" value={draft.mask} onChange={(v) => setField('mask', v)} error={shownErrors.mask} disabled={isDhcp} />
      <TextField label="Varsayılan ağ geçidi" value={draft.gateway} onChange={(v) => setField('gateway', v)} error={shownErrors.gateway} disabled={isDhcp} />
      <TextField label="Tercih edilen DNS sunucusu" value={draft.dnsPrimary} onChange={(v) => setField('dnsPrimary', v)} error={shownErrors.dnsPrimary} disabled={isDhcp} />
      <TextField label="Diğer DNS sunucusu" value={draft.dnsSecondary} onChange={(v) => setField('dnsSecondary', v)} error={shownErrors.dnsSecondary} disabled={isDhcp} />
      <button
        type="submit"
        className={`self-start rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 ${focusRing}`}
      >
        IP ayarlarını kaydet
      </button>
    </form>
  )
}

export default HostSettingsForm
