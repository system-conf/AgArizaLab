import { Compass, X } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNumberFormat } from '../layout/useNumberFormat'
import { focusRing } from '../shared/focusRing'

interface GuideButtonProps {
  /** Guide steps from general direction to the exact answer. */
  steps: readonly string[]
  /** How many steps are already shown (0..steps.length). */
  revealedCount: number
  /** Show the next step; the caller increments `revealedCount`. */
  onReveal: () => void
}

/** Guide control: opens a panel where the guide steps are shown one at a time. */
function GuideButton({ steps, revealedCount, onReveal }: GuideButtonProps) {
  const { t } = useTranslation('exercise')
  const formatNumber = useNumberFormat()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const shown = steps.slice(0, revealedCount)
  const canReveal = revealedCount < steps.length
  const countParams = { revealed: formatNumber(revealedCount), total: formatNumber(steps.length) }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`flex h-9 items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-2.5 text-sm font-medium text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 sm:px-3 ${focusRing}`}
      >
        <Compass className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">{t('guide.button')}</span>
        <span className="tabular-nums" aria-hidden="true">
          {t('guide.count', countParams)}
        </span>
        <span className="sr-only">{t('guide.countAria', countParams)}</span>
      </button>
      {open && (
        <div
          id={panelId}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false)
          }}
          className="absolute end-0 z-30 mt-2 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-surface p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg">{t('guide.title')}</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('guide.close')}
              className={`rounded p-1 text-fg-subtle hover:bg-surface-muted ${focusRing}`}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {shown.length === 0 && <p className="text-sm text-fg-muted">{t('guide.empty')}</p>}
          <ol className="flex flex-col gap-2" aria-live="polite">
            {shown.map((step, index) => (
              <li key={index} className="rounded-md bg-amber-50 dark:bg-amber-950/40 p-2 text-sm text-fg">
                <span className="me-1 font-medium">{t('guide.stepLabel', { number: formatNumber(index + 1) })}</span>
                {step}
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={onReveal}
            disabled={!canReveal}
            className={`mt-3 w-full rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 ${focusRing}`}
          >
            {canReveal ? t('guide.reveal', { number: formatNumber(revealedCount + 1) }) : t('guide.allRevealed')}
          </button>
        </div>
      )}
    </div>
  )
}

export default GuideButton
