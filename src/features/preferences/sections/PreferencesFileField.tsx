import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePreferencesStore, type PreferencesImportResult } from '../../../preferences'
import { downloadText } from '../../cli/configDownload'
import { focusRing } from '../../shared/focusRing'
import ConfirmAction from '../controls/ConfirmAction'

/** File name of an exported preferences file. */
const PREFERENCES_FILE_NAME = 'agArizaLabPreferences.json'

type Status = { tone: 'success' | 'error'; text: string } | null

const BUTTON = `min-h-9 rounded-lg px-3 py-1.5 text-sm font-medium text-accent-text ring-1 ring-border-strong hover:bg-surface-muted ${focusRing}`

/** Data tab: export / import the preferences as a JSON file, and reset them to the defaults. */
function PreferencesFileField() {
  const { t } = useTranslation('preferences')
  const store = usePreferencesStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const headingId = useId()
  const [status, setStatus] = useState<Status>(null)

  function importResult(result: PreferencesImportResult): Status {
    if (!result.ok) return { tone: 'error', text: t(`data.file.${result.reason}`) }
    if (result.ignored.length > 0) return { tone: 'success', text: t('data.file.importedWithIgnored', { count: result.ignored.length }) }
    return { tone: 'success', text: t('data.file.imported') }
  }

  function importFile(file: File) {
    file.text().then(
      (text) => setStatus(importResult(store.importJson(text))),
      (error: unknown) => {
        console.warn('The preferences file could not be read.', error)
        setStatus({ tone: 'error', text: t('data.file.readFailed') })
      },
    )
  }

  function exportFile() {
    downloadText(store.exportJson(), PREFERENCES_FILE_NAME)
    setStatus({ tone: 'success', text: t('data.file.exported') })
  }

  function resetAll() {
    store.reset()
    setStatus({ tone: 'success', text: t('data.resetPreferences.done') })
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="text-sm font-medium text-fg">
          {t('data.file.heading')}
        </h3>
        <p className="text-xs text-fg-subtle">{t('data.file.lead')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={exportFile}
          className={BUTTON}
        >
          {t('data.file.export')}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className={BUTTON}>
          {t('data.file.import')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) importFile(file)
          }}
        />
      </div>
      <ConfirmAction
        label={t('data.resetPreferences.button')}
        question={t('data.resetPreferences.confirm')}
        confirmLabel={t('data.resetPreferences.confirmButton')}
        onConfirm={resetAll}
      />
      <p role="status" className={`text-sm ${status?.tone === 'error' ? 'text-danger' : 'text-success'}`}>
        {status?.text}
      </p>
    </section>
  )
}

export default PreferencesFileField
