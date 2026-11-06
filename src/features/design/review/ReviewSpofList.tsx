import { ShieldCheck, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMessageTranslator } from '../../../i18n'
import type { ReviewSpofRow } from '../model/DesignReviewView'
import ReviewSection from './ReviewSection'

interface ReviewSpofListProps {
  rows: ReviewSpofRow[]
}

/** Single points of failure: which device's loss breaks what, and whether that is expected (access) or a risk (core). */
function ReviewSpofList({ rows }: ReviewSpofListProps) {
  const { t } = useTranslation('design')
  const translate = useMessageTranslator()

  return (
    <ReviewSection id="designReviewSpof" title={t('ui.review.spof.title')} icon={TriangleAlert}>
      <p className="mb-3 text-sm leading-relaxed text-slate-600">{t('ui.review.spof.lead')}</p>
      {rows.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t('ui.review.spof.none')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.deviceId}
              className={`rounded-xl px-3 py-2.5 text-sm ring-1 ${row.access ? 'bg-slate-50 ring-slate-200' : 'bg-amber-50 ring-amber-200'}`}
            >
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">{row.deviceName}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${row.access ? 'bg-slate-200 text-slate-700' : 'bg-amber-200 text-amber-900'}`}
                >
                  {t(row.access ? 'ui.review.spof.access' : 'ui.review.spof.core')}
                </span>
              </p>
              <p className="mt-1 text-slate-700">{translate(row.explanation)}</p>
              <p className="mt-2 text-xs font-medium text-slate-600">{t('ui.review.spof.breaks')}</p>
              <ul className="mt-1 list-disc ps-5 text-slate-700">
                {row.breaks.map((broken) => (
                  <li key={broken.id}>{translate(broken.description)}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </ReviewSection>
  )
}

export default ReviewSpofList
