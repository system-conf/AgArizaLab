import { ArrowRight, Hammer, PartyPopper, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SampleCompletion, SampleTexts } from '../../../samples'
import { useNumberFormat } from '../../layout/useNumberFormat'
import AppLink from '../../shared/AppLink'
import { focusRing } from '../../shared/focusRing'
import type { LessonStepView } from '../model/LessonSteps'
import type { RelatedLinkView } from '../model/RelatedLinks'
import LessonStepItem from './LessonStepItem'

export interface LessonPanelProps {
  texts: SampleTexts
  steps: readonly LessonStepView[]
  completion: SampleCompletion
  /** A step check is waiting for the lab to settle. */
  checking: boolean
  related: readonly RelatedLinkView[]
  /** Name of a device in the open lab (undefined when it was deleted). */
  nameOf: (deviceId: string) => string | undefined
  onTick: (stepId: string, done: boolean) => void
  onResetProgress: () => void
}

/** The mini lesson beside the sample lab: intro, live "try this" steps, "break it" ideas and where next. */
function LessonPanel({ texts, steps, completion, checking, related, nameOf, onTick, onResetProgress }: LessonPanelProps) {
  const { t } = useTranslation('samples')
  const formatNumber = useNumberFormat()
  const textOf = new Map(texts.steps.map((step) => [step.id, step]))
  const progress = t('ui.lesson.steps.progress', { done: formatNumber(completion.done), total: formatNumber(completion.total) })
  const introParts = [
    { id: 'what', label: t('ui.lesson.intro.what'), text: texts.intro.what },
    { id: 'why', label: t('ui.lesson.intro.why'), text: texts.intro.why },
    { id: 'realWorld', label: t('ui.lesson.intro.realWorld'), text: texts.intro.realWorld },
  ].filter((part) => part.text !== '')

  return (
    <div className="flex flex-col gap-5 text-slate-800">
      <p className="rounded-lg bg-teal-50 p-2.5 text-xs leading-relaxed text-teal-900 ring-1 ring-teal-200">{t('ui.lesson.freeNote')}</p>

      {introParts.length > 0 && (
        <section aria-labelledby="sampleIntroTitle" className="flex flex-col gap-2">
          <h3 id="sampleIntroTitle" className="text-sm font-semibold text-slate-900">
            {t('ui.lesson.intro.title')}
          </h3>
          <dl className="flex flex-col gap-2">
            {introParts.map((part) => (
              <div key={part.id} className="flex flex-col gap-0.5">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{part.label}</dt>
                <dd className="text-sm leading-relaxed">{part.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section aria-labelledby="sampleStepsTitle" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="sampleStepsTitle" className="text-sm font-semibold text-slate-900">
            {t('ui.lesson.steps.title')}
          </h3>
          <span aria-live="polite" className={`text-xs ${completion.complete ? 'font-medium text-emerald-700' : 'text-slate-500'}`}>
            {progress}
          </span>
        </div>
        {checking && <p className="text-xs text-slate-500">{t('ui.lesson.steps.checking')}</p>}
        <ol className="flex flex-col gap-2">
          {steps.map((view) => {
            const text = textOf.get(view.step.id)
            const focus = view.step.focusDeviceId
            return (
              <LessonStepItem
                key={view.step.id}
                view={view}
                title={text?.title ?? view.step.id}
                detail={text?.detail ?? ''}
                focusName={focus === undefined ? undefined : nameOf(focus)}
                onTick={onTick}
              />
            )
          })}
        </ol>
        {completion.complete && (
          <div role="status" className="flex gap-2 rounded-lg bg-emerald-50 p-2.5 text-sm text-emerald-900 ring-1 ring-emerald-200">
            <PartyPopper className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">{t('ui.lesson.complete.title')}</p>
              <p>{t('ui.lesson.complete.text')}</p>
            </div>
          </div>
        )}
        {completion.done > 0 && (
          <button
            type="button"
            onClick={onResetProgress}
            className={`flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 ${focusRing}`}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {t('ui.lesson.resetProgress')}
          </button>
        )}
      </section>

      {texts.breakIt.length > 0 && (
        <section aria-labelledby="sampleBreakItTitle" className="flex flex-col gap-2">
          <h3 id="sampleBreakItTitle" className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Hammer className="h-4 w-4 text-amber-700" aria-hidden="true" />
            {t('ui.lesson.breakIt.title')}
          </h3>
          <p className="text-xs leading-relaxed text-slate-600">{t('ui.lesson.breakIt.lead')}</p>
          <ul className="flex flex-col gap-2">
            {texts.breakIt.map((idea) => (
              <li key={idea.id} className="rounded-lg bg-white p-2.5 text-sm ring-1 ring-amber-200">
                <p className="font-medium text-slate-900">{idea.change}</p>
                {idea.result !== '' && (
                  <details className="mt-1">
                    <summary className={`cursor-pointer rounded text-xs font-medium text-amber-800 ${focusRing}`}>{t('ui.lesson.breakIt.result')}</summary>
                    <p className="mt-1 text-sm leading-relaxed text-slate-700">{idea.result}</p>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {related.length > 0 && (
        <section aria-labelledby="sampleRelatedTitle" className="flex flex-col gap-2">
          <h3 id="sampleRelatedTitle" className="text-sm font-semibold text-slate-900">
            {t('ui.lesson.related.title')}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {related.map((link) => (
              <li key={link.key}>
                <AppLink
                  to={link.route}
                  className={`flex items-center gap-2 rounded-lg bg-white p-2.5 text-sm ring-1 ring-slate-200 hover:ring-teal-300 ${focusRing}`}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{t(`ui.lesson.related.kind.${link.kind}`)}</span>
                    <span className="font-medium text-slate-900">{link.title}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 rtl:-scale-x-100" aria-hidden="true" />
                </AppLink>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export default LessonPanel
