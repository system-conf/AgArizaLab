import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../layout/LanguageSwitcher'
import { useNumberFormat } from '../layout/useNumberFormat'
import { focusRing } from '../shared/focusRing'

interface ScenarioHeaderProps {
  title: string
  /** 1-based position of the exercise. */
  order: number
  total: number
  /** Extra controls at the end, e.g. the GuideButton (kept last so its panel opens inside the screen). */
  actions?: ReactNode
  onBack?: () => void
}

/** Top bar of an exercise: back, title with n/total, language switcher and actions. */
function ScenarioHeader({ title, order, total, actions, onBack }: ScenarioHeaderProps) {
  const { t } = useTranslation('exercise')
  const formatNumber = useNumberFormat()

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur sm:gap-3 sm:px-4">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label={t('header.backAria')}
          className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${focusRing}`}
        >
          <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
          <span className="hidden sm:inline">{t('header.back')}</span>
        </button>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-sky-700">
          {t('header.position', { order: formatNumber(order), total: formatNumber(total) })}
        </p>
        <h1 className="truncate text-sm font-semibold text-slate-900 sm:text-base">{title}</h1>
      </div>
      <LanguageSwitcher />
      {actions && <div className="shrink-0">{actions}</div>}
    </header>
  )
}

export default ScenarioHeader
