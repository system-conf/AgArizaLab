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

/** Top bar during a scenario: title, n/total, timer and actions. */
function ScenarioHeader({ title, order, total, elapsedSeconds, actions, onBack }: ScenarioHeaderProps) {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 ${focusRing}`}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Senaryolar
        </button>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-500">
          Senaryo {order}/{total}
        </p>
        <h1 className="truncate text-lg font-semibold text-slate-900">{title}</h1>
      </div>
      <p className="flex items-center gap-1 font-mono text-sm text-slate-700" aria-label={`Geçen süre ${formatDuration(elapsedSeconds)}`}>
        <Timer className="h-4 w-4" aria-hidden="true" />
        {formatDuration(elapsedSeconds)}
      </p>
      {actions}
    </header>
  )
}

export default ScenarioHeader
