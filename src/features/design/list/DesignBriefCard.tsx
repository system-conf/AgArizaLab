import { ArrowRight, CircleCheck, CircleDot, RotateCcw, Wallet } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { useNumberFormat } from '../../layout/useNumberFormat'
import { difficultyStyles } from '../../scenario/scenarioDifficulty'
import { focusRing } from '../../shared/focusRing'
import type { DesignListItem } from './designListItem'
import { designSettingIcons } from './designSettingIcons'

interface DesignBriefCardProps {
  item: DesignListItem
  onStart: (briefId: string) => void
}

/** One design brief in the list: setting, title, difficulty, budget, topics, state and a start button. */
function DesignBriefCard({ item, onStart }: DesignBriefCardProps) {
  const { t } = useTranslation(['design', 'landing'])
  const formatNumber = useNumberFormat()
  const SettingIcon = designSettingIcons[item.setting]
  const difficulty = difficultyStyles[item.difficulty]
  const levelLabel = t(`landing:difficulty.${item.difficulty}`)
  const titleId = useId()
  const started = item.state !== 'new'

  return (
    <article
      aria-labelledby={titleId}
      className={`flex h-full flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
        item.state === 'solved' ? 'border-emerald-200' : 'border-slate-200 hover:border-sky-300'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100">
          <SettingIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="flex flex-col items-end gap-1 text-end">
          <span className="text-xs text-slate-500">
            {t('design:ui.list.cardMeta', { order: formatNumber(item.order), setting: t(`design:settings.${item.setting}`) })}
          </span>
          <span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${difficulty.badgeClass}`}>
            <span className="flex items-end gap-0.5" aria-hidden="true">
              {[1, 2, 3].map((bar) => (
                <span
                  key={bar}
                  className={`w-1 rounded-sm ${bar <= difficulty.bars ? 'bg-current' : 'bg-current opacity-25'}`}
                  style={{ height: `${4 + bar * 2}px` }}
                />
              ))}
            </span>
            <span aria-hidden="true">{levelLabel}</span>
            <span className="sr-only">{t('landing:card.difficulty', { level: levelLabel })}</span>
          </span>
        </div>
      </div>
      <h3 id={titleId} className="text-base font-semibold leading-snug text-slate-900">
        {item.title}
      </h3>
      <p className="flex items-center gap-1.5 text-sm text-slate-600">
        <Wallet className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        {item.budget === undefined
          ? t('design:ui.list.noBudget')
          : t('design:ui.list.budget', { amount: t('design:units.price', { amount: item.budget }) })}
      </p>
      {item.topics.length > 0 && (
        <ul aria-label={t('design:ui.list.topics')} className="flex flex-wrap gap-1.5">
          {item.topics.map((topic) => (
            <li key={topic} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
              {topic}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        {item.state === 'solved' && (
          <span className="flex items-center gap-1 text-sm font-medium text-emerald-700">
            <CircleCheck className="h-4 w-4" aria-hidden="true" />
            {t('design:ui.list.state.solved')}
          </span>
        )}
        {item.state === 'submitted' && (
          <span className="flex items-center gap-1 text-sm font-medium text-amber-700">
            <CircleDot className="h-4 w-4" aria-hidden="true" />
            {t('design:ui.list.state.submitted')}
          </span>
        )}
        {item.state === 'new' && <span className="text-sm text-slate-500">{t('design:ui.list.state.new')}</span>}
        <button
          type="button"
          onClick={() => onStart(item.id)}
          aria-label={t(started ? 'design:ui.list.againAria' : 'design:ui.list.startAria', { title: item.title })}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
            started ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50' : 'bg-sky-700 text-white hover:bg-sky-800'
          } ${focusRing}`}
        >
          {started ? (
            <>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {t('design:ui.list.again')}
            </>
          ) : (
            <>
              {t('design:ui.list.start')}
              <ArrowRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </article>
  )
}

export default DesignBriefCard
