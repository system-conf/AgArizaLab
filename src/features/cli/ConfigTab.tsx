import { Check, Copy } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Device } from '../../domain'
import { focusRing } from '../shared/focusRing'
import { appCliShell, managementOf } from './cliServices'

interface ConfigTabProps {
  device: Device
}

type CopyState = 'idle' | 'copied' | 'failed'

/** How long "Copied" stays on the button. */
const COPIED_MS = 2000

/** Console text reads left to right in every UI language, like on a real device. */
const configDirection = 'ltr'

interface ConfigBlockProps {
  title: string
  copyLabel: string
  /** null: nothing to show (the note instead). */
  text: string | null
  note?: string
}

/** One configuration text with its heading and a copy button. */
function ConfigBlock({ title, copyLabel, text, note }: ConfigBlockProps) {
  const { t } = useTranslation('cli')
  const headingId = useId()
  const [copy, setCopy] = useState<CopyState>('idle')

  useEffect(() => {
    if (copy === 'idle') return undefined
    const timer = window.setTimeout(() => setCopy('idle'), COPIED_MS)
    return () => window.clearTimeout(timer)
  }, [copy])

  function copyText(value: string) {
    // Through a promise so a missing clipboard API (insecure origin) also ends in the failed state.
    Promise.resolve(value)
      .then((content) => navigator.clipboard.writeText(content))
      .then(
        () => setCopy('copied'),
        () => setCopy('failed'),
      )
  }

  let buttonText = t('ui.config.copy')
  if (copy === 'copied') buttonText = t('ui.config.copied')
  else if (copy === 'failed') buttonText = t('ui.config.copyFailed')

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <h4 id={headingId} className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          {title}
        </h4>
        {text !== null && (
          <button
            type="button"
            onClick={() => copyText(text)}
            aria-label={copy === 'idle' ? copyLabel : buttonText}
            className={`flex items-center gap-1 rounded-md border border-border-strong px-2 py-1 text-xs text-fg hover:bg-surface-subtle ${focusRing}`}
          >
            {copy === 'copied' ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            <span aria-live="polite">{buttonText}</span>
          </button>
        )}
      </div>
      {note !== undefined && <p className="text-sm text-fg-muted">{note}</p>}
      {text !== null && (
        <pre
          dir={configDirection}
          tabIndex={0}
          aria-labelledby={headingId}
          className={`max-h-80 overflow-auto rounded-lg border border-border-strong bg-slate-950 px-3 py-2 font-console text-[12px] leading-snug text-slate-100 ${focusRing}`}
        >
          {text}
        </pre>
      )}
    </section>
  )
}

/**
 * "Config" tab of routers and managed switches: running-config (built from the device every time, so
 * Settings and CLI changes show at once) and the saved startup-config, each with a copy button.
 */
function ConfigTab({ device }: ConfigTabProps) {
  const { t } = useTranslation('cli')
  const running = appCliShell.runningConfig(device).join('\n')
  const startup = managementOf(device).startupConfig
  const unsaved = startup !== undefined && startup !== running
  return (
    <div className="flex flex-col gap-4">
      <ConfigBlock title={t('ui.config.running')} copyLabel={t('ui.config.copyRunning')} text={running} note={unsaved ? t('ui.config.unsaved') : undefined} />
      <ConfigBlock
        title={t('ui.config.startup')}
        copyLabel={t('ui.config.copyStartup')}
        text={startup ?? null}
        note={startup === undefined ? t('ui.config.noStartup') : undefined}
      />
    </div>
  )
}

export default ConfigTab
