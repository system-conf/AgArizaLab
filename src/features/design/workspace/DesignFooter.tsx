import { ClipboardList, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNumberFormat } from '../../layout/useNumberFormat'
import { focusRing } from '../../shared/focusRing'
import type { BudgetMeterView } from '../model/BudgetMeter'
import type { ChecklistView } from '../model/RequirementChecklist'
import BudgetMeterBar from './BudgetMeterBar'

interface DesignFooterProps {
  checklist: ChecklistView
  budget: BudgetMeterView | null
  /** The brief panel / sheet is open. */
  briefOpen: boolean
  /** Id of the element the brief button shows or hides. */
  briefControls: string | undefined
  onToggleBrief: () => void
  onSubmit: () => void
}

/** Bottom bar of the design mode: brief toggle with the checklist count, budget meter, "Submit design". */
function DesignFooter({ checklist, budget, briefOpen, briefControls, onToggleBrief, onSubmit }: DesignFooterProps) {
  const { t } = useTranslation('design')
  const formatNumber = useNumberFormat()
  const summary = t('ui.checklist.summary', { met: formatNumber(checklist.met), total: formatNumber(checklist.total) })

  return (
    <footer className="flex items-center gap-2 border-t border-border bg-surface px-2 py-2 sm:gap-3 sm:px-4">
      <button
        type="button"
        onClick={onToggleBrief}
        aria-expanded={briefOpen}
        aria-controls={briefControls}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm font-medium ${
          briefOpen ? 'border-sky-300 dark:border-sky-700 bg-accent-muted text-sky-900 dark:text-sky-200' : 'border-border-strong bg-surface text-fg hover:bg-surface-subtle'
        } ${focusRing}`}
      >
        <ClipboardList className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{t('ui.brief.title')}</span>
        <span className={checklist.allMet ? 'text-emerald-700 dark:text-emerald-300' : 'text-fg-subtle'}>{summary}</span>
      </button>
      <div className="min-w-0 flex-1">{budget && <BudgetMeterBar meter={budget} compact />}</div>
      <button
        type="button"
        onClick={onSubmit}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover ${focusRing}`}
      >
        <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
        <span className="sm:hidden">{t('ui.submit.short')}</span>
        <span className="hidden sm:inline">{t('ui.submit.label')}</span>
      </button>
    </footer>
  )
}

export default DesignFooter
