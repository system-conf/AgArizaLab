import { Briefcase, Eye, Lightbulb, PencilRuler, Presentation, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ReviewHintText } from '../../../design'
import type { DesignBriefTexts } from '../../../domain'
import { useMessageTranslator } from '../../../i18n'
import { focusRing } from '../../shared/focusRing'
import ReviewSection from './ReviewSection'

interface ReviewReferenceProps {
  hints: ReviewHintText[]
  /** Hints are shown at once (solved design); otherwise behind a "Show hints" button. */
  hintsRevealed: boolean
  reference: DesignBriefTexts['reference']
}

const referenceParts: { key: keyof DesignBriefTexts['reference']; icon: LucideIcon }[] = [
  { key: 'explanation', icon: PencilRuler },
  { key: 'presentation', icon: Presentation },
  { key: 'interviewAnswer', icon: Briefcase },
]

/** Review hints, then the reference design: why it looks like this and how to present it. */
function ReviewReference({ hints, hintsRevealed, reference }: ReviewReferenceProps) {
  const { t } = useTranslation('design')
  const translate = useMessageTranslator()
  const [asked, setAsked] = useState(false)
  const showHints = hintsRevealed || asked

  return (
    <>
      {hints.length > 0 && (
        <ReviewSection id="designReviewHints" title={t('ui.review.hints.title')} icon={Lightbulb}>
          {showHints ? (
            <ul className="flex flex-col gap-2 text-sm leading-relaxed text-fg">
              {hints.map((hint) => (
                <li key={hint.id} className="rounded-lg bg-amber-50/70 dark:bg-amber-950/30 px-3 py-2 ring-1 ring-amber-100 dark:ring-amber-900">
                  {translate(hint.message)}
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-fg-muted">{t('ui.review.hints.hiddenLead', { count: hints.length })}</p>
              <button
                type="button"
                onClick={() => setAsked(true)}
                className={`flex items-center gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 text-sm font-medium text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 ${focusRing}`}
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
                {t('ui.review.hints.show')}
              </button>
            </div>
          )}
        </ReviewSection>
      )}
      {referenceParts.map((part) => (
        <ReviewSection key={part.key} id={`designReviewReference-${part.key}`} title={t(`ui.review.reference.${part.key}`)} icon={part.icon}>
          <p className="whitespace-pre-line leading-relaxed text-fg">{reference[part.key]}</p>
        </ReviewSection>
      ))}
    </>
  )
}

export default ReviewReference
