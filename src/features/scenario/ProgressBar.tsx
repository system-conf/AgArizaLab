import { useTranslation } from 'react-i18next'
import { useNumberFormat } from '../layout/useNumberFormat'

interface ProgressBarProps {
  completed: number
  total: number
}

/** "n/total solved" with a horizontal bar. */
function ProgressBar({ completed, total }: ProgressBarProps) {
  const { t } = useTranslation('landing')
  const formatNumber = useNumberFormat()
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0
  const params = { completed: formatNumber(completed), total: formatNumber(total) }

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium text-fg">{t('progress.label')}</span>
        <span className="text-fg-muted">{t('progress.summary', params)}</span>
      </div>
      <div
        role="progressbar"
        aria-label={t('progress.ariaLabel')}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
        aria-valuetext={t('progress.valueText', params)}
        className="h-2.5 w-full overflow-hidden rounded-full bg-surface-strong"
      >
        <div className="h-full rounded-full bg-sky-600 transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

export default ProgressBar
