import { CircleX } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocalizedMessage } from '../../domain/Messages'
import { useMessageTranslator } from '../../i18n'
import { LAB_LIMITS } from '../../lab/schemas/labLimits'
import { focusRing } from '../shared/focusRing'

interface SolveFooterProps {
  notes: string
  onNotesChange: (notes: string) => void
  onVerify: () => void
  /** A verification is running (large labs: in the Web Worker); the button waits. */
  checking?: boolean
  /** One message per unmet condition; empty when nothing failed (yet). */
  failedChecks: LocalizedMessage[]
}

/** Bottom area: the learner's notes, the verify button and the result of a failed verification. */
function SolveFooter({ notes, onNotesChange, onVerify, checking = false, failedChecks }: SolveFooterProps) {
  const { t } = useTranslation('exercise')
  const translateMessage = useMessageTranslator()
  const notesId = useId()
  const sentences = [...new Set(failedChecks.map(translateMessage))]

  return (
    <footer className="flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 md:flex-row md:items-start">
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor={notesId} className="text-sm font-medium text-slate-700">
          {t('footer.notesLabel')}
        </label>
        <textarea
          id={notesId}
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          maxLength={LAB_LIMITS.notesLength}
          rows={2}
          placeholder={t('footer.notesPlaceholder')}
          className={`resize-y rounded-md border border-slate-300 px-2 py-1.5 text-sm ${focusRing}`}
        />
      </div>
      <div className="flex flex-col gap-2 md:w-96">
        <button
          type="button"
          onClick={onVerify}
          disabled={checking}
          aria-busy={checking}
          className={`rounded-md bg-emerald-700 px-4 py-2.5 font-medium text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-70 ${focusRing}`}
        >
          {t('footer.verify')}
        </button>
        {sentences.length > 0 && (
          <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-900">
            <p className="font-medium">{t('footer.notSolvedYet')}</p>
            <ul className="mt-1 flex flex-col gap-1">
              {sentences.map((sentence) => (
                <li key={sentence} className="flex items-start gap-1.5">
                  <CircleX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {sentence}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </footer>
  )
}

export default SolveFooter
