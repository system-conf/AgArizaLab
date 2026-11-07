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
      <p className="mb-3 text-sm leading-relaxed text-fg-muted">{t('ui.review.spof.lead')}</p>
      {rows.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200 ring-1 ring-emerald-200 dark:ring-emerald-800">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t('ui.review.spof.none')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.deviceId}
              className={`rounded-xl px-3 py-2.5 text-sm ring-1 ${row.access ? 'bg-surface-subtle ring-border' : 'bg-amber-50 dark:bg-amber-950/40 ring-amber-200 dark:ring-amber-800'}`}
            >
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-fg-strong">{row.deviceName}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${row.access ? 'bg-surface-strong text-fg' : 'bg-amber-200 dark:bg-amber-800/50 text-amber-900 dark:text-amber-200'}`}
                >
                  {t(row.access ? 'ui.review.spof.access' : 'ui.review.spof.core')}
                </span>
              </p>
              <p className="mt-1 text-fg">{translate(row.explanation)}</p>
              <p className="mt-2 text-xs font-medium text-fg-muted">{t('ui.review.spof.breaks')}</p>
              <ul className="mt-1 list-disc ps-5 text-fg">
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
