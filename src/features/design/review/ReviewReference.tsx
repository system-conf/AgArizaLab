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
            <ul className="flex flex-col gap-2 text-sm leading-relaxed text-slate-700">
              {hints.map((hint) => (
                <li key={hint.id} className="rounded-lg bg-amber-50/70 px-3 py-2 ring-1 ring-amber-100">
                  {translate(hint.message)}
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-slate-600">{t('ui.review.hints.hiddenLead', { count: hints.length })}</p>
              <button
                type="button"
                onClick={() => setAsked(true)}
                className={`flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 ${focusRing}`}
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
          <p className="whitespace-pre-line leading-relaxed text-slate-700">{reference[part.key]}</p>
        </ReviewSection>
      ))}
    </>
  )
}

export default ReviewReference
