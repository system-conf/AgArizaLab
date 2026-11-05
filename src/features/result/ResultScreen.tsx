import { CircleCheck, Clock, Lightbulb } from 'lucide-react'
import type { ScenarioExplanation } from '../../domain/ScenarioTypes'
import { formatDuration } from '../scenario/formatDuration'
import { focusRing } from '../shared/focusRing'

interface ResultScreenProps {
  title: string
  explanation: ScenarioExplanation
  topics: string[]
  elapsedSeconds: number
  hintsUsed: number
  totalHints: number
  /** Omit on the last scenario; the next button is then hidden. */
  onNext?: () => void
  onBackToList: () => void
}

const sections: { key: keyof ScenarioExplanation; title: string }[] = [
  { key: 'whatHappened', title: 'Ne olmuştu?' },
  { key: 'realLife', title: 'Gerçek hayatta' },
  { key: 'interviewAnswer', title: 'Mülakatta böyle anlatabilirsin' },
]

/** Shown after a correct solve: explanation, time, hints used and navigation. */
function ResultScreen(props: ResultScreenProps) {
  const { title, explanation, topics, elapsedSeconds, hintsUsed, totalHints, onNext, onBackToList } = props

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="text-center">
        <CircleCheck className="mx-auto mb-2 h-12 w-12 text-emerald-600" aria-hidden="true" />
        <h1 className="text-2xl font-semibold text-slate-900">Tebrikler, arıza giderildi!</h1>
        <p className="mt-1 text-slate-600">{title}</p>
        <div className="mt-3 flex justify-center gap-4 text-sm text-slate-700">
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" aria-hidden="true" /> Süre: {formatDuration(elapsedSeconds)}
          </span>
          <span className="flex items-center gap-1">
            <Lightbulb className="h-4 w-4" aria-hidden="true" /> Kullanılan ipucu: {hintsUsed}/{totalHints}
          </span>
        </div>
      </header>
      {sections.map((section) => (
        <section key={section.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold text-slate-900">{section.title}</h2>
          <p className="whitespace-pre-line leading-relaxed text-slate-700">{explanation[section.key]}</p>
        </section>
      ))}
      {topics.length > 0 && (
        <section aria-label="Konular" className="flex flex-wrap gap-2">
          {topics.map((topic) => (
            <span key={topic} className="rounded-full bg-sky-50 px-3 py-1 text-xs text-sky-900 ring-1 ring-sky-200">
              {topic}
            </span>
          ))}
        </section>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={onBackToList}
          className={`rounded-md border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50 ${focusRing}`}
        >
          Senaryo listesine dön
        </button>
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            className={`rounded-md bg-sky-700 px-4 py-2 font-medium text-white hover:bg-sky-800 ${focusRing}`}
          >
            Sonraki senaryo
          </button>
        )}
      </div>
    </main>
  )
}

export default ResultScreen
