import { CircleCheck, CircleDashed, CircleX, LockKeyhole } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMessageTranslator } from '../../../i18n'
import { useNumberFormat } from '../../layout/useNumberFormat'
import type { ChecklistStatus, ChecklistView } from '../model/RequirementChecklist'
import { useMeasureText } from './useMeasureText'

const statusStyles: Record<ChecklistStatus, { icon: typeof CircleCheck; className: string }> = {
  met: { icon: CircleCheck, className: 'text-emerald-600' },
  unmet: { icon: CircleX, className: 'text-rose-600' },
  unknown: { icon: CircleDashed, className: 'text-slate-400' },
}

interface RequirementChecklistViewProps {
  checklist: ChecklistView
  /** The lab changed since the shown results (a check is waiting). */
  checking: boolean
}

/** The live requirement checklist: green = met, red = not yet, grey = not checked; hidden ones as placeholders. */
function RequirementChecklistView({ checklist, checking }: RequirementChecklistViewProps) {
  const { t } = useTranslation('design')
  const translate = useMessageTranslator()
  const measureText = useMeasureText()
  const formatNumber = useNumberFormat()

  return (
    <section aria-labelledby="designChecklistTitle" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="designChecklistTitle" className="text-sm font-semibold text-slate-900">
          {t('ui.checklist.title')}
        </h2>
        <span className="text-xs text-slate-500" aria-live="polite">
          {checking ? t('ui.checklist.checking') : t('ui.checklist.summary', { met: formatNumber(checklist.met), total: formatNumber(checklist.total) })}
        </span>
      </div>
      <ul className={`flex flex-col gap-1.5 transition-opacity ${checking ? 'opacity-70' : ''}`}>
        {checklist.items.map((item) => {
          const { icon: Icon, className } = statusStyles[item.status]
          return (
            <li key={item.id} className="flex items-start gap-2 rounded-lg bg-white px-2.5 py-2 text-sm ring-1 ring-slate-200">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${className}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <span className="sr-only">{t(`ui.checklist.status.${item.status}`)}: </span>
                <span className="text-slate-800">{translate(item.description)}</span>
                {item.qualifier && <span className="text-slate-600"> {translate(item.qualifier)}</span>}
                {item.measure && item.status !== 'met' && (
                  <span className="mt-0.5 block text-xs text-slate-500">{measureText(item.measure)}</span>
                )}
              </div>
            </li>
          )
        })}
        {Array.from({ length: checklist.hiddenCount }, (_, index) => (
          <li
            key={`hidden-${index}`}
            className="flex items-start gap-2 rounded-lg border border-dashed border-slate-300 px-2.5 py-2 text-sm text-slate-500"
          >
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t('ui.checklist.hidden')}</span>
          </li>
        ))}
      </ul>
      {checklist.allMet && !checking && (
        <p role="status" className="rounded-lg bg-emerald-50 px-2.5 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
          {t('ui.checklist.allMet')}
        </p>
      )}
    </section>
  )
}

export default RequirementChecklistView
