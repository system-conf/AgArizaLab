import { CircleX } from 'lucide-react'
import { useId } from 'react'
import { focusRing } from '../shared/focusRing'

interface SolveFooterProps {
  notes: string
  onNotesChange: (notes: string) => void
  onCheck: () => void
  /** Plain Turkish sentences for each unmet condition; empty when nothing failed (yet). */
  failedChecks: string[]
}

/** Bottom area: player's notebook, the solve button and the result of a failed check. */
function SolveFooter({ notes, onNotesChange, onCheck, failedChecks }: SolveFooterProps) {
  const notesId = useId()

  return (
    <footer className="flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 md:flex-row md:items-start">
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor={notesId} className="text-sm font-medium text-slate-700">
          Not defterim
        </label>
        <textarea
          id={notesId}
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          rows={2}
          placeholder="Bulduklarını buraya not al…"
          className={`resize-y rounded-md border border-slate-300 px-2 py-1.5 text-sm ${focusRing}`}
        />
      </div>
      <div className="flex flex-col gap-2 md:w-96">
        <button
          type="button"
          onClick={onCheck}
          className={`rounded-md bg-emerald-700 px-4 py-2.5 font-medium text-white hover:bg-emerald-800 ${focusRing}`}
        >
          Çözdüm, kontrol et
        </button>
        {failedChecks.length > 0 && (
          <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-900">
            <p className="font-medium">Henüz çözülmedi:</p>
            <ul className="mt-1 flex flex-col gap-1">
              {failedChecks.map((sentence) => (
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
