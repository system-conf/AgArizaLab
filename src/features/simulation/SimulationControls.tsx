import { ChevronDown, ChevronUp, Download, Pause, Play, RotateCcw, StepBack, StepForward } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../i18n'
import { focusRing } from '../shared/focusRing'
import { PLAY_SPEEDS } from './simulationServices'
import type { WorkspaceSimulation } from './useSimulation'

interface ControlButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  children: ReactNode
}

function ControlButton({ label, onClick, disabled, primary, children }: ControlButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-40 ${
        primary ? 'bg-sky-600 text-white hover:bg-accent disabled:hover:bg-sky-600' : 'text-fg hover:bg-surface-muted'
      } ${focusRing}`}
    >
      {children}
    </button>
  )
}

interface SimulationControlsProps {
  simulation: WorkspaceSimulation
  expanded: boolean
  onToggleExpanded: () => void
  /** id of the panel body (aria-controls of the collapse button). */
  bodyId: string
}

/** Header of the simulation panel: step back, play / pause, step forward, reset, speed, time, export. */
function SimulationControls({ simulation, expanded, onToggleExpanded, bodyId }: SimulationControlsProps) {
  const { t } = useTranslation('simulation')
  const { language } = useLanguage()
  const { view, playback } = simulation
  const canForward = view?.canStepForward ?? false
  const speedIndex = Math.max(0, PLAY_SPEEDS.indexOf(playback.speed))
  const seconds = new Intl.NumberFormat(language, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format((view?.time ?? 0) / 1000)
  const speedText = t('ui.controls.speedValue', { speed: new Intl.NumberFormat(language).format(playback.speed) })

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1">
      <div role="group" aria-label={t('ui.controls.label')} className="flex items-center gap-0.5">
        <ControlButton label={t('ui.controls.stepBack')} onClick={playback.stepBack} disabled={!(view?.canStepBack ?? false)}>
          <StepBack className="h-5 w-5" aria-hidden="true" />
        </ControlButton>
        {playback.playing ? (
          <ControlButton label={t('ui.controls.pause')} onClick={playback.pause} primary>
            <Pause className="h-5 w-5" aria-hidden="true" />
          </ControlButton>
        ) : (
          <ControlButton label={t('ui.controls.play')} onClick={playback.play} disabled={!canForward} primary>
            <Play className="h-5 w-5" aria-hidden="true" />
          </ControlButton>
        )}
        <ControlButton label={t('ui.controls.stepForward')} onClick={playback.stepForward} disabled={!canForward}>
          <StepForward className="h-5 w-5" aria-hidden="true" />
        </ControlButton>
        <ControlButton label={t('ui.controls.reset')} onClick={simulation.reset}>
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
        </ControlButton>
      </div>
      <label className="flex items-center gap-1.5 text-xs text-fg-muted">
        <span>{t('ui.controls.speed')}</span>
        <input
          type="range"
          min={0}
          max={PLAY_SPEEDS.length - 1}
          step={1}
          value={speedIndex}
          aria-valuetext={speedText}
          onChange={(event) => playback.setSpeed(PLAY_SPEEDS[Number(event.target.value)] ?? 1)}
          className="w-20 accent-sky-600"
        />
        <span className="w-9 tabular-nums text-fg" aria-hidden="true">
          {speedText}
        </span>
      </label>
      <p className="text-xs" title={t('ui.controls.time')}>
        <span className="sr-only">{t('ui.controls.time')}</span>
        <span className="font-mono tabular-nums text-fg-strong">{t('ui.time.seconds', { value: seconds })}</span>
      </p>
      <div className="ms-auto flex items-center gap-0.5">
        <ControlButton label={t('ui.controls.exportPcap')} onClick={simulation.exportPcap}>
          <Download className="h-5 w-5" aria-hidden="true" />
        </ControlButton>
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-controls={bodyId}
          aria-label={expanded ? t('ui.panel.collapse') : t('ui.panel.expand')}
          title={expanded ? t('ui.panel.collapse') : t('ui.panel.expand')}
          className={`flex h-9 w-9 items-center justify-center rounded-md text-fg-muted hover:bg-surface-muted ${focusRing}`}
        >
          {expanded ? <ChevronDown className="h-5 w-5" aria-hidden="true" /> : <ChevronUp className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
      {view.status !== 'ready' ? (
        <p className="w-full text-xs text-fg-subtle" role="status">
          {t(view.status === 'preparing' ? 'ui.prepare.preparing' : 'ui.prepare.dormant')}
        </p>
      ) : (
        !canForward && (
          <p className="w-full text-xs text-fg-subtle" role="status">
            {t('ui.controls.idle')}
          </p>
        )
      )}
    </div>
  )
}

export default SimulationControls
