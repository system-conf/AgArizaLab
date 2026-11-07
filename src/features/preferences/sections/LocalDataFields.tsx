import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppRouteCodec, routes } from '../../../routing'
import ConfirmAction from '../controls/ConfirmAction'
import { browserDataEraser } from '../model/browserDataEraser'
import { PROGRESS_KINDS, type ProgressKind } from '../model/LocalDataEraser'

/**
 * Data tab: reset the progress of chosen kinds (then the page reloads, so every screen reads it again)
 * and clear all local data (then the home page opens). Both ask first.
 */
function LocalDataFields() {
  const { t } = useTranslation('preferences')
  const progressId = useId()
  const clearId = useId()
  const [kinds, setKinds] = useState<readonly ProgressKind[]>(PROGRESS_KINDS)
  const [failed, setFailed] = useState(false)

  function toggle(kind: ProgressKind) {
    setKinds((current) => PROGRESS_KINDS.filter((candidate) => (candidate === kind ? !current.includes(kind) : current.includes(candidate))))
  }

  function resetProgress() {
    const result = browserDataEraser().resetProgress(kinds)
    if (result.ok) window.location.reload()
    else setFailed(true)
  }

  function clearAll() {
    void browserDataEraser()
      .clearAll()
      .then((result) => {
        if (result.ok) window.location.assign(AppRouteCodec.format(routes.landing))
        else setFailed(true)
      })
  }

  return (
    <>
      <section aria-labelledby={progressId} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 id={progressId} className="text-sm font-medium text-fg">
            {t('data.progress.heading')}
          </h3>
          <p className="text-xs text-fg-subtle">{t('data.progress.lead')}</p>
        </div>
        <div role="group" aria-labelledby={progressId} className="flex flex-col gap-2">
          {PROGRESS_KINDS.map((kind) => (
            <label key={kind} className="flex items-center gap-2 text-sm text-fg">
              <input type="checkbox" checked={kinds.includes(kind)} onChange={() => toggle(kind)} className="h-4 w-4 accent-accent" />
              {t(`data.progress.${kind}`)}
            </label>
          ))}
        </div>
        {kinds.length === 0 && <p className="text-xs text-fg-subtle">{t('data.progress.nothingSelected')}</p>}
        <ConfirmAction
          label={t('data.progress.button')}
          question={t('data.progress.confirm')}
          confirmLabel={t('data.progress.confirmButton')}
          onConfirm={resetProgress}
          disabled={kinds.length === 0}
          danger
        />
      </section>
      <section aria-labelledby={clearId} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 id={clearId} className="text-sm font-medium text-fg">
            {t('data.clear.heading')}
          </h3>
          <p className="text-xs text-fg-subtle">{t('data.clear.lead')}</p>
        </div>
        <ConfirmAction label={t('data.clear.button')} question={t('data.clear.confirm')} confirmLabel={t('data.clear.confirmButton')} onConfirm={clearAll} danger />
        <p role="alert" className="text-sm text-danger">
          {failed ? t('data.clear.failed') : null}
        </p>
      </section>
    </>
  )
}

export default LocalDataFields
