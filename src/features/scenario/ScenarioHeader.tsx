import { ArrowLeft, Timer } from 'lucide-react'
import type { ReactNode } from 'react'
import { focusRing } from '../shared/focusRing'
import { formatDuration } from './formatDuration'

interface ScenarioHeaderProps {
  title: string
  /** 1-based position of the scenario. */
  order: number
  total: number
  elapsedSeconds: number
  /** Extra controls on the right, e.g. the HintButton. */
  actions?: ReactNode
  onBack?: () => void
}

/** Top bar during a scenario: back, title with n/total, timer chip and actions. */
function ScenarioHeader({ title, order, total, elapsedSeconds, actions, onBack }: ScenarioHeaderProps) {
  const duration = formatDuration(elapsedSeconds)

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur sm:gap-3 sm:px-4">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Senaryo listesine dön"
          className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${focusRing}`}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Senaryolar</span>
        </button>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-sky-700">
          Senaryo {order}/{total}
        </p>
        <h1 className="truncate text-sm font-semibold text-slate-900 sm:text-base">{title}</h1>
      </div>
      <p className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-3 font-mono text-sm tabular-nums text-slate-700">
        <Timer className="h-4 w-4 text-slate-500" aria-hidden="true" />
        <span className="sr-only">Geçen süre </span>
        {duration}
      </p>
      {actions && <div className="shrink-0">{actions}</div>}
    </header>
  )
}

export default ScenarioHeader
