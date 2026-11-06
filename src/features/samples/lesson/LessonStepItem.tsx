import { Circle, CircleAlert, CircleCheck, LoaderCircle, MonitorPlay, Monitor } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { useNumberFormat } from '../../layout/useNumberFormat'
import { focusRing } from '../../shared/focusRing'
import type { LessonStepState, LessonStepView } from '../model/LessonSteps'

interface LessonStepItemProps {
  view: LessonStepView
  title: string
  detail: string
  /** Name of the step's focus device in the open lab (undefined: none or deleted). */
  focusName: string | undefined
  onTick: (stepId: string, done: boolean) => void
}

const stateStyles: Readonly<Record<LessonStepState, { icon: typeof Circle; className: string }>> = {
  passing: { icon: CircleCheck, className: 'text-emerald-600' },
  done: { icon: CircleCheck, className: 'text-emerald-600' },
  doneBroken: { icon: CircleAlert, className: 'text-amber-600' },
  checking: { icon: LoaderCircle, className: 'text-slate-400 motion-safe:animate-spin' },
  open: { icon: Circle, className: 'text-slate-400' },
  ticked: { icon: CircleCheck, className: 'text-emerald-600' },
  unticked: { icon: Circle, className: 'text-slate-400' },
}

/** One "try this" step: number, live state, title, detail, Simulation-mode hint, focus device and the tick box. */
function LessonStepItem({ view, title, detail, focusName, onTick }: LessonStepItemProps) {
  const { t } = useTranslation('samples')
  const formatNumber = useNumberFormat()
  const titleId = useId()
  const style = stateStyles[view.state]
  const Icon = style.icon
  const number = formatNumber(view.number)

  return (
    <li
      aria-labelledby={titleId}
      aria-current={view.current ? 'step' : undefined}
      className={`flex gap-2.5 rounded-lg p-2.5 ring-1 ${view.current ? 'bg-white ring-teal-300' : 'bg-white/60 ring-slate-200'}`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.className}`} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{t('ui.lesson.steps.number', { number })}</p>
        <h4 id={titleId} className="text-sm font-semibold leading-snug text-slate-900">
          {title}
        </h4>
        {detail !== '' && <p className="text-sm leading-relaxed text-slate-700">{detail}</p>}
        {view.step.mode === 'simulation' && (
          <p className="flex items-start gap-1.5 text-xs text-violet-800">
            <MonitorPlay className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t('ui.lesson.steps.simulation')}
          </p>
        )}
        {focusName !== undefined && (
          <p className="flex items-center gap-1.5 text-xs text-slate-600">
            <Monitor className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t('ui.lesson.steps.focus', { name: focusName })}
          </p>
        )}
        {view.kind === 'manual' ? (
          <label className="mt-0.5 flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              checked={view.done}
              onChange={(event) => onTick(view.step.id, event.target.checked)}
              aria-label={t('ui.lesson.steps.tickAria', { number, title })}
              className={`h-4 w-4 rounded border-slate-300 accent-teal-700 ${focusRing}`}
            />
            <span aria-hidden="true">{t('ui.lesson.steps.tick')}</span>
          </label>
        ) : (
          <p className={`text-xs font-medium ${view.state === 'doneBroken' ? 'text-amber-800' : view.done || view.state === 'passing' ? 'text-emerald-700' : 'text-slate-500'}`}>
            {t(`ui.lesson.steps.state.${view.state}`)}
          </p>
        )}
      </div>
    </li>
  )
}

export default LessonStepItem
