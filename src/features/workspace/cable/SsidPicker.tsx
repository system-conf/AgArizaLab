import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { focusRing } from '../../shared/focusRing'
import NodePopover from './NodePopover'

interface SsidPickerProps {
  /** Device the popover is attached to (the second end). */
  nodeId: string
  /** SSIDs offered by the access point. */
  options: readonly string[]
  onSubmit: (ssid: string) => void
  onCancel: () => void
}

/** Wireless association: pick one of the AP's SSIDs or type any name (a misconfigured client is allowed). */
function SsidPicker({ nodeId, options, onSubmit, onCancel }: SsidPickerProps) {
  const { t } = useTranslation('workspace')
  const [ssid, setSsid] = useState(options[0] ?? '')
  const inputId = useId()
  const listId = useId()

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit(ssid)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    onCancel()
  }

  return (
    <NodePopover nodeId={nodeId} label={t('ssidPicker.title')}>
      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-2">
        <h2 className="font-semibold text-fg-strong">{t('ssidPicker.title')}</h2>
        <p className="text-xs text-fg-subtle">{options.length > 0 ? t('ssidPicker.hint') : t('ssidPicker.noOptions')}</p>
        {options.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSsid(option)}
                aria-pressed={ssid === option}
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  ssid === option ? 'border-sky-500 bg-accent-muted text-sky-800 dark:text-sky-200' : 'border-border-strong text-fg hover:bg-surface-subtle'
                } ${focusRing}`}
              >
                {option}
              </button>
            ))}
          </div>
        )}
        <label htmlFor={inputId} className="block text-xs font-medium text-fg">
          {t('ssidPicker.label')}
        </label>
        <input
          id={inputId}
          // The picker opens on purpose; typing can start right away.
          autoFocus
          list={listId}
          value={ssid}
          onChange={(event) => setSsid(event.target.value)}
          autoComplete="off"
          className={`w-full rounded-md border border-border-strong px-2 py-1.5 text-sm ${focusRing}`}
        />
        <datalist id={listId}>
          {options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className={`rounded-md px-3 py-1.5 text-fg hover:bg-surface-muted ${focusRing}`}>
            {t('ssidPicker.cancel')}
          </button>
          <button type="submit" className={`rounded-md bg-sky-600 px-3 py-1.5 font-medium text-white hover:bg-accent ${focusRing}`}>
            {t('ssidPicker.connect')}
          </button>
        </div>
      </form>
    </NodePopover>
  )
}

export default SsidPicker
