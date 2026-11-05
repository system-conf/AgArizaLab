import { ArrowRight, Briefcase, Building2, CircleCheck, Clock, Lightbulb, List, Search, type LucideIcon } from 'lucide-react'
import type { ScenarioExplanation } from '../../domain/ScenarioTypes'
import { formatDuration } from '../scenario/formatDuration'
import { focusRing } from '../shared/focusRing'
import ShareOnLinkedIn from './ShareOnLinkedIn'

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

const sections: { key: keyof ScenarioExplanation; title: string; icon: LucideIcon }[] = [
  { key: 'whatHappened', title: 'Ne olmuştu?', icon: Search },
  { key: 'realLife', title: 'Gerçek hayatta', icon: Building2 },
  { key: 'interviewAnswer', title: 'Mülakatta böyle anlatabilirsin', icon: Briefcase },
]

/** Shown after a correct solve: success header, explanation cards, sharing and navigation. */
function ResultScreen(props: ResultScreenProps) {
  const { title, explanation, topics, elapsedSeconds, hintsUsed, totalHints, onNext, onBackToList } = props

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-5 px-4 py-6 sm:py-10">
      <header className="flex flex-col items-center gap-3 rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 px-5 py-8 text-center text-white shadow-lg">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
          <CircleCheck className="h-8 w-8" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-semibold sm:text-3xl">Tebrikler, arıza giderildi!</h1>
        <p className="text-emerald-50">{title}</p>
        <ul aria-label="Sonuç" className="flex flex-wrap justify-center gap-2 text-sm">
          <li className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1">
            <Clock className="h-4 w-4" aria-hidden="true" /> Süre: <span className="font-mono">{formatDuration(elapsedSeconds)}</span>
          </li>
          <li className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1">
            <Lightbulb className="h-4 w-4" aria-hidden="true" /> Kullanılan ipucu: {hintsUsed}/{totalHints}
          </li>
        </ul>
        {topics.length > 0 && (
          <ul aria-label="Konular" className="flex flex-wrap justify-center gap-1.5">
            {topics.map((topic) => (
              <li key={topic} className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-emerald-900">
                {topic}
              </li>
            ))}
          </ul>
        )}
      </header>
      {sections.map((section) => {
        const Icon = section.icon
        return (
          <section key={section.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              {section.title}
            </h2>
            <p className="whitespace-pre-line leading-relaxed text-slate-700">{explanation[section.key]}</p>
          </section>
        )
      })}
      <ShareOnLinkedIn />
      <nav aria-label="Sonraki adım" className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={onBackToList}
          className={`flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-700 hover:bg-slate-50 ${focusRing}`}
        >
          <List className="h-4 w-4" aria-hidden="true" />
          Senaryo listesine dön
        </button>
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            className={`flex items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-2.5 font-medium text-white hover:bg-sky-800 ${focusRing}`}
          >
            Sonraki senaryo
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </nav>
    </main>
  )
}

export default ResultScreen
