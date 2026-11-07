import { Clock, Footprints, LoaderCircle, MailPlus, Power } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { focusRing } from '../shared/focusRing'
import type { SimMode } from './simulationServices'
import { useDelayedFlag } from './useDelayedFlag'
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

/** Quick builds (a small lab) show no "preparing" state. */
const PREPARING_HINT_DELAY_MS = 400

/**
 * Right end of the canvas toolbar: the simulation's state while it is prepared (or a start button for a
 * very large lab), the Realtime / Simulation switch and, in simulation, the Simple PDU tool.
 */
function SimulationToolbar({ simulation, onToolStart }: SimulationToolbarProps) {
  const { t } = useTranslation('simulation')
  const { mode, pduTool, view } = simulation
  const preparing = useDelayedFlag(view.status === 'preparing', PREPARING_HINT_DELAY_MS)

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-s border-border bg-surface px-2 py-1">
      {/* role=status: screen readers hear when the preparation starts; the text stays while it runs. */}
      <p role="status" className={preparing ? 'flex items-center gap-1.5 px-1 text-xs text-fg-muted' : 'sr-only'}>
        {preparing && (
          <>
            <LoaderCircle className="h-4 w-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{t('ui.prepare.preparing')}</span>
          </>
        )}
      </p>
      {view.status === 'dormant' && (
        <button
          type="button"
          onClick={simulation.prepare}
          title={t('ui.prepare.startHint')}
          className={`flex h-8 items-center gap-1.5 rounded-md bg-sky-600 px-2 text-xs font-medium text-white hover:bg-accent sm:text-sm ${focusRing}`}
        >
          <Power className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t('ui.prepare.start')}
        </button>
      )}
      {mode === 'simulation' && (
        <button
          type="button"
          disabled={view.status !== 'ready'}
          onClick={() => {
            if (pduTool.active) return pduTool.cancel()
            onToolStart()
            pduTool.start()
          }}
          aria-pressed={pduTool.active}
          aria-label={t('ui.pduTool.button')}
          title={t('ui.pduTool.button')}
          className={`flex h-9 w-9 items-center justify-center rounded-md text-fg transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40 ${
            pduTool.active ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200 ring-1 ring-violet-300 dark:ring-violet-700 hover:bg-violet-100 dark:hover:bg-violet-900/40' : ''
          } ${focusRing}`}
        >
          <MailPlus className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
      <div role="group" aria-label={t('ui.modes.label')} className="flex rounded-lg bg-surface-muted p-0.5">
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
                checked ? 'bg-surface text-sky-800 dark:text-sky-200 shadow-sm ring-1 ring-border' : 'text-fg-muted hover:text-fg-strong'
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
