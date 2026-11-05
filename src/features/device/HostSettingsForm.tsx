import { useId, useState, type FormEvent } from 'react'
import type { Device, HostNetworkConfig, IpMode } from '../../domain/NetworkTypes'
import { focusRing } from '../shared/focusRing'
import { isIpv4Format, isSubnetMaskFormat } from './ipv4Format'
import TextField from './TextField'

interface HostSettingsFormProps {
  device: Device
  host: HostNetworkConfig
  onUpdateDevice: (next: Device) => void
}

interface HostDraft {
  mode: IpMode
  ip: string
  mask: string
  gateway: string
  dnsPrimary: string
  dnsSecondary: string
}

type DraftErrors = Partial<Record<keyof HostDraft, string>>

function toDraft(host: HostNetworkConfig): HostDraft {
  return {
    mode: host.mode,
    ip: host.ip,
    mask: host.mask,
    gateway: host.gateway,
    dnsPrimary: host.dns[0] ?? '',
    dnsSecondary: host.dns[1] ?? '',
  }
}

const formatError = 'Geçerli bir IPv4 adresi yazın (ör. 192.168.1.10).'

function validate(draft: HostDraft): DraftErrors {
  // DHCP mode: the addresses come from the server, so the fields are not checked.
  if (draft.mode === 'dhcp') return {}
  const errors: DraftErrors = {}
  const ip = draft.ip.trim()
  const mask = draft.mask.trim()
  if (ip === '') errors.ip = 'Statik modda IP adresi gerekli.'
  else if (!isIpv4Format(ip)) errors.ip = formatError
  if (mask === '') errors.mask = 'Statik modda alt ağ maskesi gerekli.'
  else if (!isSubnetMaskFormat(mask)) errors.mask = 'Geçerli bir maske yazın (ör. 255.255.255.0).'
  const optionalFields = ['gateway', 'dnsPrimary', 'dnsSecondary'] as const
  for (const field of optionalFields) {
    const value = draft[field].trim()
    if (value !== '' && !isIpv4Format(value)) errors[field] = formatError
  }
  return errors
}

function liveErrors(errors: DraftErrors, draft: HostDraft): DraftErrors {
  const live: DraftErrors = {}
  for (const field of Object.keys(errors) as (keyof HostDraft)[]) {
    if (draft[field].trim() !== '') live[field] = errors[field]
  }
  return live
}

function toHost(draft: HostDraft, previous: HostNetworkConfig): HostNetworkConfig {
  if (draft.mode === 'dhcp') {
    // Address fields stay as they are until the DHCP server hands out new ones.
    return { ...previous, mode: 'dhcp' }
  }
  return {
    mode: 'static',
    ip: draft.ip.trim(),
    mask: draft.mask.trim(),
    gateway: draft.gateway.trim(),
    dns: [draft.dnsPrimary.trim(), draft.dnsSecondary.trim()].filter((value) => value !== ''),
  }
}

/**
 * IP settings form of an end device. Parent should remount it (via `key`) when the
 * device's host config changes from outside, e.g. after 'ipconfig /renew'.
 */
function HostSettingsForm({ device, host, onUpdateDevice }: HostSettingsFormProps) {
  const [draft, setDraft] = useState<HostDraft>(() => toDraft(host))
  const [submitted, setSubmitted] = useState(false)
  const modeId = useId()
  const errors = validate(draft)
  const hasErrors = Object.keys(errors).length > 0
  // Format errors show while typing; "required" errors only after a save attempt.
  const shownErrors = submitted ? errors : liveErrors(errors, draft)
  const isDhcp = draft.mode === 'dhcp'

  function setField(field: keyof HostDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    if (hasErrors) return
    onUpdateDevice({ ...device, host: toHost(draft, host) })
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
          Adres bilgileri DHCP sunucusundan gelir. Yeni adres almak için Terminal sekmesinde
          <span className="font-mono"> ipconfig /renew </span>yazın.
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
