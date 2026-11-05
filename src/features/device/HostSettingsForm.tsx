import { useId, useState, type FormEvent } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import type { Device, HostNetworkConfig } from '../../domain/NetworkTypes'
import { TerminalAvailability } from '../../engine'
import { useMessageTranslator } from '../../i18n'
import { focusRing } from '../shared/focusRing'
import { HostSettingsFormModel, type HostDraft } from './HostSettingsFormModel'
import TextField from './TextField'

interface HostSettingsFormProps {
  device: Device
  host: HostNetworkConfig
  onUpdateDevice: (next: Device) => void
}

type AddressField = Exclude<keyof HostDraft, 'mode'>

/** Address inputs in display order, with their label keys in the `device` namespace. */
const addressFields = [
  { field: 'ip', labelKey: 'hostForm.ip' },
  { field: 'mask', labelKey: 'hostForm.mask' },
  { field: 'gateway', labelKey: 'hostForm.gateway' },
  { field: 'dnsPrimary', labelKey: 'hostForm.dnsPrimary' },
  { field: 'dnsSecondary', labelKey: 'hostForm.dnsSecondary' },
] as const satisfies readonly { field: AddressField; labelKey: `hostForm.${AddressField}` }[]

/**
 * IP settings form of an end device. Parent should remount it (via `key`) when the
 * device's host config changes from outside, e.g. after 'ipconfig /renew'.
 */
function HostSettingsForm({ device, host, onUpdateDevice }: HostSettingsFormProps) {
  const { t } = useTranslation('device')
  const translateMessage = useMessageTranslator()
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

  function errorText(field: AddressField): string | undefined {
    const message = shownErrors[field]
    return message === undefined ? undefined : translateMessage(message)
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
          {t('hostForm.modeLabel')}
        </label>
        <select
          id={modeId}
          value={draft.mode}
          onChange={(event) => setField('mode', event.target.value === 'dhcp' ? 'dhcp' : 'static')}
          className={`rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm ${focusRing}`}
        >
          <option value="dhcp">{t('ipMode.dhcp')}</option>
          <option value="static">{t('ipMode.static')}</option>
        </select>
      </div>
      {isDhcp && (
        <p className="rounded-md bg-sky-50 p-2 text-xs text-sky-900">
          {t('hostForm.dhcpInfo')}
          {/* Only devices with a terminal can ask for a new address themselves. */}
          {TerminalAvailability.isAvailable(device) && (
            <>
              {' '}
              <Trans t={t} i18nKey="hostForm.renewHint" components={{ cmd: <span className="font-mono" /> }} />
            </>
          )}
        </p>
      )}
      {addressFields.map(({ field, labelKey }) => (
        <TextField
          key={field}
          label={t(labelKey)}
          value={draft[field]}
          onChange={(value) => setField(field, value)}
          error={errorText(field)}
          disabled={isDhcp}
        />
      ))}
      <button
        type="submit"
        className={`self-start rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 ${focusRing}`}
      >
        {t('hostForm.save')}
      </button>
    </form>
  )
}

export default HostSettingsForm
