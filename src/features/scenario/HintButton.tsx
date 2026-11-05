import { Lightbulb, X } from 'lucide-react'
import { useId, useState } from 'react'
import { focusRing } from '../shared/focusRing'

interface HintButtonProps {
  hints: readonly string[]
  /** How many hints are already revealed (0..hints.length). */
  revealedCount: number
  /** Reveal the next hint; the caller increments `revealedCount`. */
  onReveal: () => void
}

/** Hint control: opens a panel where hints are revealed one at a time. */
function HintButton({ hints, revealedCount, onReveal }: HintButtonProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const shown = hints.slice(0, revealedCount)
  const canReveal = revealedCount < hints.length

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-100 ${focusRing}`}
      >
        <Lightbulb className="h-4 w-4" aria-hidden="true" />
        İpucu ({revealedCount}/{hints.length})
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">İpuçları</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="İpuçlarını kapat"
              className={`rounded p-1 text-slate-500 hover:bg-slate-100 ${focusRing}`}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {shown.length === 0 && (
            <p className="text-sm text-slate-600">
              Henüz ipucu açmadın. Her ipucu bir öncekinden daha net; önce kendin denemek iyi olur.
            </p>
          )}
          <ol className="flex flex-col gap-2" aria-live="polite">
            {shown.map((hint, index) => (
              <li key={index} className="rounded-md bg-amber-50 p-2 text-sm text-slate-800">
                <span className="font-medium">{index + 1}. ipucu: </span>
                {hint}
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={onReveal}
            disabled={!canReveal}
            className={`mt-3 w-full rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:bg-slate-300 ${focusRing}`}
          >
            {canReveal ? `${revealedCount + 1}. ipucunu aç` : 'Tüm ipuçları açıldı'}
          </button>
        </div>
      )}
    </div>
  )
}

export default HintButton
