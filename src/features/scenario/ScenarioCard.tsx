import { ArrowRight, CircleCheck, RotateCcw } from 'lucide-react'
import { useId } from 'react'
import { focusRing } from '../shared/focusRing'
import { difficultyInfo, difficultyOf } from './scenarioDifficulty'
import type { ScenarioListItem } from './scenarioListItem'
import { settingLabels } from './settingLabels'

interface ScenarioCardProps {
  item: ScenarioListItem
  onStart: (scenarioId: string) => void
}

/** One scenario on the start page: setting, title, difficulty, topics and a start button. */
function ScenarioCard({ item, onStart }: ScenarioCardProps) {
  const setting = settingLabels[item.setting]
  const SettingIcon = setting.icon
  const difficulty = difficultyInfo[difficultyOf(item.id)]
  const titleId = useId()

  return (
    <article
      aria-labelledby={titleId}
      className={`flex h-full flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
        item.completed ? 'border-emerald-200' : 'border-slate-200 hover:border-sky-300'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
          <SettingIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="flex flex-col items-end gap-1 text-right">
          <span className="text-xs text-slate-500">
            Senaryo {item.order} · {setting.label}
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
            <span>
              <span className="sr-only">Zorluk: </span>
              {difficulty.label}
            </span>
          </span>
        </div>
      </div>
      <h3 id={titleId} className="text-base font-semibold leading-snug text-slate-900">
        {item.title}
      </h3>
      {item.topics.length > 0 && (
        <ul aria-label="Konular" className="flex flex-wrap gap-1.5">
          {item.topics.map((topic) => (
            <li key={topic} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
              {topic}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        {item.completed ? (
          <span className="flex items-center gap-1 text-sm font-medium text-emerald-700">
            <CircleCheck className="h-4 w-4" aria-hidden="true" />
            Tamamlandı
          </span>
        ) : (
          <span className="text-sm text-slate-500">Henüz oynanmadı</span>
        )}
        <button
          type="button"
          onClick={() => onStart(item.id)}
          aria-label={`${item.title} senaryosunu ${item.completed ? 'tekrar oyna' : 'başlat'}`}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
            item.completed
              ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              : 'bg-sky-700 text-white hover:bg-sky-800'
          } ${focusRing}`}
        >
          {item.completed ? (
            <>
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Tekrar oyna
            </>
          ) : (
            <>
              Başla <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </article>
  )
}

export default ScenarioCard
