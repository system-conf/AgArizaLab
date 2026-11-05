import { useState, type FormEvent } from 'react'
import type { AppLink, Device } from '../../domain/NetworkTypes'
import { focusRing } from '../shared/focusRing'
import { Ipv4 } from '../../engine'
import TextField from './TextField'

interface AppLinkSettingsProps {
  device: Device
  appLinks: AppLink[]
  onUpdateDevice: (next: Device) => void
}

/**
 * Edits the target address of each application link (e.g. a PC's printer address).
 * Parent should remount it (via `key`) when the links change from outside.
 */
function AppLinkSettings({ device, appLinks, onUpdateDevice }: AppLinkSettingsProps) {
  const [targets, setTargets] = useState<Record<string, string>>(() =>
    Object.fromEntries(appLinks.map((appLink) => [appLink.id, appLink.targetIp])),
  )
  const errorFor = (id: string): string | undefined => {
    const value = (targets[id] ?? '').trim()
    return Ipv4.isValid(value) ? undefined : 'Geçerli bir IPv4 adresi yazın (ör. 192.168.1.150).'
  }
  const hasErrors = appLinks.some((appLink) => errorFor(appLink.id) !== undefined)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (hasErrors) return
    const nextLinks = appLinks.map((appLink) => ({
      ...appLink,
      targetIp: (targets[appLink.id] ?? appLink.targetIp).trim(),
    }))
    onUpdateDevice({ ...device, appLinks: nextLinks })
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      {appLinks.map((appLink) => (
        <TextField
          key={appLink.id}
          label={`${appLink.label} adresi`}
          value={targets[appLink.id] ?? ''}
          onChange={(value) => setTargets((current) => ({ ...current, [appLink.id]: value }))}
          error={errorFor(appLink.id)}
        />
      ))}
      <button
        type="submit"
        disabled={hasErrors}
        className={`self-start rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:bg-slate-300 ${focusRing}`}
      >
        Uygulama adreslerini kaydet
      </button>
    </form>
  )
}

export default AppLinkSettings
