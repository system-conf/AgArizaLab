import { useTranslation } from 'react-i18next'
import type { DesignExercise } from '../../../domain'
import ComplaintCard from '../../scenario/ComplaintCard'
import type { BudgetMeterView } from '../model/BudgetMeter'
import type { ChecklistView } from '../model/RequirementChecklist'
import BudgetMeterBar from './BudgetMeterBar'
import RequirementChecklistView from './RequirementChecklistView'

interface BriefPanelProps {
  brief: DesignExercise
  checklist: ChecklistView
  checking: boolean
  budget: BudgetMeterView | null
}

/** The brief next to the canvas: the customer's message, the budget meter and the live checklist. */
function BriefPanel({ brief, checklist, checking, budget }: BriefPanelProps) {
  const { t } = useTranslation('design')
  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="designCustomerTitle" className="flex flex-col gap-2">
        <h2 id="designCustomerTitle" className="text-sm font-semibold text-slate-900">
          {t('ui.brief.customer')}
        </h2>
        <ComplaintCard from={brief.texts.customer.from} message={brief.texts.customer.message} />
      </section>
      {budget && (
        <section aria-label={t('ui.budget.label')} className="rounded-lg bg-white p-2.5 ring-1 ring-slate-200">
          <BudgetMeterBar meter={budget} />
        </section>
      )}
      <RequirementChecklistView checklist={checklist} checking={checking} />
      <p className="text-xs leading-relaxed text-slate-500">{t('ui.brief.howTo')}</p>
    </div>
  )
}

export default BriefPanel
