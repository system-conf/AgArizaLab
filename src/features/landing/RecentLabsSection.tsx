import { CircleAlert, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocalizedMessage } from '../../domain/Messages'
import { useMessageTranslator } from '../../i18n'
import { LAB_FILE_ACCEPT } from '../../lab/labFileTypes'
import { routes, useAppRouter } from '../../routing'
import { focusRing } from '../shared/focusRing'
import { loadLabLauncher } from '../shared/labLauncherLoader'
import RecentLabList from '../shared/RecentLabList'
import { useRecentLabs } from '../shared/useRecentLabs'

/** "Recent labs" on the start page: open or delete a saved lab, or import a lab file. */
function RecentLabsSection() {
  const { t } = useTranslation(['lab', 'landing'])
  const translate = useMessageTranslator()
  const router = useAppRouter()
  const recent = useRecentLabs()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importErrors, setImportErrors] = useState<readonly LocalizedMessage[] | null>(null)

  function open(labId: string) {
    loadLabLauncher()
      .then((launcher) => launcher.markLabOpened(labId))
      .then(
        () => router.navigate(routes.lab),
        (error: unknown) => console.warn(`The lab ${labId} could not be marked as opened.`, error),
      )
  }

  function importFile(file: File) {
    setImportErrors(null)
    loadLabLauncher()
      .then((launcher) => launcher.importLabAsNew(file))
      .then(
        (result) => (result.ok ? router.navigate(routes.lab) : setImportErrors(result.errors)),
        (error: unknown) => {
          console.error('Lab import failed', error)
          setImportErrors([])
        },
      )
  }

  return (
    <section aria-labelledby="recentLabsTitle" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="recentLabsTitle" className="text-lg font-semibold text-fg-strong">
            {t('lab:recent.title')}
          </h2>
          <p className="text-sm text-fg-subtle">{recent.storageAvailable ? t('landing:recentLabs.hint') : t('lab:storage.unavailable')}</p>
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={`flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm font-medium text-fg hover:bg-surface-subtle ${focusRing}`}
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {t('landing:recentLabs.import')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={LAB_FILE_ACCEPT}
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
      {importErrors !== null && (
        <div role="alert" className="flex gap-2 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-3 text-sm text-rose-900 dark:text-rose-200">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">{t('landing:recentLabs.importFailed')}</p>
            <ul className="mt-1 list-disc ps-4">
              {importErrors.map((error, index) => (
                <li key={index}>{translate(error)}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <RecentLabList entries={recent.entries} loadingText={t('landing:recentLabs.loading')} onOpen={open} onDelete={recent.remove} />
    </section>
  )
}

export default RecentLabsSection
