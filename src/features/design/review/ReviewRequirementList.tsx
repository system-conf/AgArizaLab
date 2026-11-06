import { CircleCheck, CircleMinus, CircleX, ListChecks, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ReviewedRequirement, ReviewStatus } from '../../../design'
import { useMessageTranslator } from '../../../i18n'
import ReviewSection from './ReviewSection'

interface ReviewRequirementListProps {
  rows: ReviewedRequirement[]
}

const statusStyles: Record<ReviewStatus, { icon: LucideIcon; row: string; tint: string }> = {
  met: { icon: CircleCheck, row: 'bg-emerald-50/60 ring-emerald-200', tint: 'text-emerald-600' },
  metNotScored: { icon: CircleMinus, row: 'bg-slate-50 ring-slate-200', tint: 'text-slate-500' },
  failed: { icon: CircleX, row: 'bg-rose-50/60 ring-rose-200', tint: 'text-rose-600' },
}

/** Every requirement with its result, progress and notes (acceptance tests, what broke it). */
function ReviewRequirementList({ rows }: ReviewRequirementListProps) {
  const { t } = useTranslation('design')
  const translate = useMessageTranslator()

  return (
    <ReviewSection id="designReviewRequirements" title={t('ui.review.requirements.title')} icon={ListChecks}>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const style = statusStyles[row.status]
          const Icon = style.icon
          return (
            <li key={row.id} className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-sm ring-1 ${style.row}`}>
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.tint}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <span className="sr-only">{translate(row.statusLabel)}: </span>
                <span className="text-slate-800">{translate(row.description)}</span>
                {row.qualifier && <span className="text-slate-600"> {translate(row.qualifier)}</span>}
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                  <span aria-hidden="true" className="font-medium">
                    {translate(row.statusLabel)}
                  </span>
                  {row.progress && !row.ok && <span>{translate(row.progress)}</span>}
                  {row.weight !== 1 && <span>{t('ui.review.requirements.weight', { weight: row.weight })}</span>}
                  {row.notes.map((note) => (
                    <span key={note.key}>
                      {translate(note)}
                    </span>
                  ))}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </ReviewSection>
  )
}

export default ReviewRequirementList
