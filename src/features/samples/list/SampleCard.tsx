import { ArrowRight, CircleCheck, Cpu } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { routes } from '../../../routing'
import { useNumberFormat } from '../../layout/useNumberFormat'
import AppLink from '../../shared/AppLink'
import { focusRing } from '../../shared/focusRing'
import type { SampleListItem } from '../model/SampleListModel'
import { sampleLevelStyles } from './sampleLevelStyles'

interface SampleCardProps {
  item: SampleListItem
}

/** One sample in the list: title, summary, level, required features, topics, step progress and "Open". */
function SampleCard({ item }: SampleCardProps) {
  const { t } = useTranslation('samples')
  const formatNumber = useNumberFormat()
  const titleId = useId()
  const level = sampleLevelStyles[item.level]
  const levelLabel = t(`levels.${item.level}`)
  const { done, total, complete } = item.completion
  const percent = total > 0 ? Math.round((done / total) * 100) : 0
  const stepParams = { done: formatNumber(done), total: formatNumber(total) }

  return (
    <article
      aria-labelledby={titleId}
      className={`flex h-full flex-col gap-3 rounded-2xl border bg-surface p-4 shadow-sm transition hover:shadow-md ${
        complete ? 'border-emerald-200 dark:border-emerald-800' : 'border-border hover:border-teal-300 dark:hover:border-teal-700'
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${level.badgeClass}`}>
          <span className="flex items-end gap-0.5" aria-hidden="true">
            {[1, 2, 3].map((bar) => (
              <span
                key={bar}
                className={`w-1 rounded-sm ${bar <= level.bars ? 'bg-current' : 'bg-current opacity-25'}`}
                style={{ height: `${4 + bar * 2}px` }}
              />
            ))}
          </span>
          <span aria-hidden="true">{levelLabel}</span>
          <span className="sr-only">{t('ui.card.level', { level: levelLabel })}</span>
        </span>
        {item.features.length > 0 && (
          <ul aria-label={t('ui.card.needs')} className="flex flex-wrap gap-1.5">
            {item.features.map((feature) => (
              <li key={feature} className="flex items-center gap-1 rounded-full bg-violet-50 dark:bg-violet-950/40 px-2 py-0.5 text-xs font-medium text-violet-800 dark:text-violet-200 ring-1 ring-violet-200 dark:ring-violet-800">
                <Cpu className="h-3 w-3" aria-hidden="true" />
                {t(`features.${feature}`)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <h3 id={titleId} className="text-base font-semibold leading-snug text-fg-strong">
        {item.title}
      </h3>
      {item.summary !== '' && <p className="text-sm leading-relaxed text-fg-muted">{item.summary}</p>}
      {item.topics.length > 0 && (
        <ul aria-label={t('ui.card.topics')} className="flex flex-wrap gap-1.5">
          {item.topics.map((topic) => (
            <li key={topic} className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-fg">
              {topic}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-col gap-2 pt-1">
        <div className="flex items-center justify-between gap-2 text-xs">
          {complete ? (
            <span className="flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300">
              <CircleCheck className="h-4 w-4" aria-hidden="true" />
              {t('ui.card.complete')}
            </span>
          ) : (
            <span className="text-fg-subtle">{done === 0 ? t('ui.card.notStarted') : t('ui.card.steps', stepParams)}</span>
          )}
        </div>
        <div
          role="progressbar"
          aria-label={item.title}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-valuetext={t('ui.card.stepsAria', stepParams)}
          className="h-1.5 w-full overflow-hidden rounded-full bg-surface-strong"
        >
          <div className={`h-full rounded-full ${complete ? 'bg-emerald-600' : 'bg-teal-600'}`} style={{ width: `${percent}%` }} />
        </div>
        <AppLink
          to={routes.sample(item.id)}
          aria-label={t('ui.card.openAria', { title: item.title })}
          className={`flex items-center justify-center gap-1.5 self-end rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 ${focusRing}`}
        >
          {t('ui.card.open')}
          <ArrowRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
        </AppLink>
      </div>
    </article>
  )
}

export default SampleCard
