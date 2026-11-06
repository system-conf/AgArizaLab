import { Clock, Footprints, MailPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { focusRing } from '../shared/focusRing'
import type { SimMode } from './simulationServices'
import type { WorkspaceSimulation } from './useSimulation'

interface SimulationToolbarProps {
  simulation: WorkspaceSimulation
  /** Another canvas tool must stop when the Simple PDU tool starts (the cable tool). */
  onToolStart: () => void
}

const MODES: readonly { mode: SimMode; icon: typeof Clock }[] = [
  { mode: 'realtime', icon: Clock },
  { mode: 'simulation', icon: Footprints },
]

/** Right end of the canvas toolbar: Realtime / Simulation switch and, in simulation, the Simple PDU tool. */
function SimulationToolbar({ simulation, onToolStart }: SimulationToolbarProps) {
  const { t } = useTranslation('simulation')
  const { mode, pduTool } = simulation

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-s border-slate-200 bg-white px-2 py-1">
      {mode === 'simulation' && (
        <button
          type="button"
          onClick={() => {
            if (pduTool.active) return pduTool.cancel()
            onToolStart()
            pduTool.start()
          }}
          aria-pressed={pduTool.active}
          aria-label={t('ui.pduTool.button')}
          title={t('ui.pduTool.button')}
          className={`flex h-9 w-9 items-center justify-center rounded-md text-slate-700 transition hover:bg-slate-100 ${
            pduTool.active ? 'bg-violet-100 text-violet-800 ring-1 ring-violet-300 hover:bg-violet-100' : ''
          } ${focusRing}`}
        >
          <MailPlus className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
      <div role="group" aria-label={t('ui.modes.label')} className="flex rounded-lg bg-slate-100 p-0.5">
        {MODES.map(({ mode: option, icon: Icon }) => {
          const checked = mode === option
          return (
            <button
              key={option}
              type="button"
              aria-pressed={checked}
              title={t(option === 'realtime' ? 'ui.modes.realtimeHint' : 'ui.modes.simulationHint')}
              onClick={() => simulation.setMode(option)}
              className={`flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition sm:text-sm ${
                checked ? 'bg-white text-sky-800 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'
              } ${focusRing}`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{t(`ui.modes.${option}`)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default SimulationToolbar
