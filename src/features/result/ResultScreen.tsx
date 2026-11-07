import { ArrowRight, Briefcase, Building2, CircleCheck, Compass, FlaskConical, List, RotateCcw, Search, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ExerciseTexts } from '../../domain'
import SiteHeader from '../layout/SiteHeader'
import { useNumberFormat } from '../layout/useNumberFormat'
import { focusRing } from '../shared/focusRing'
import ShareOnLinkedIn from './ShareOnLinkedIn'

interface ResultScreenProps {
  title: string
  explanation: ScenarioExplanation
  topics: string[]
  guideStepsUsed: number
  totalGuideSteps: number
  /** Omit on the last exercise; the next button is then hidden. */
  onNext?: () => void
  onSolveAgain: () => void
  onBackToList: () => void
  /** Copies the repaired network into a new free lab and opens it; resolves false when that failed. */
  onOpenInLab?: () => Promise<boolean>
}

type ScenarioExplanation = ExerciseTexts['explanation']

const sections: { key: keyof ScenarioExplanation; icon: LucideIcon }[] = [
  { key: 'whatHappened', icon: Search },
  { key: 'realLife', icon: Building2 },
  { key: 'interviewAnswer', icon: Briefcase },
]

const secondaryButton = `flex items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-fg hover:bg-surface-subtle ${focusRing}`

/** Solution report after a successful verification: summary, explanation cards, sharing and navigation. */
function ResultScreen(props: ResultScreenProps) {
  const { title, explanation, topics, guideStepsUsed, totalGuideSteps, onNext, onSolveAgain, onBackToList, onOpenInLab } = props
  const { t } = useTranslation('results')
  const formatNumber = useNumberFormat()
  const [openInLab, setOpenInLab] = useState<'idle' | 'busy' | 'failed'>('idle')

  function handleOpenInLab() {
    if (!onOpenInLab) return
    setOpenInLab('busy')
    onOpenInLab().then(
      (opened) => setOpenInLab(opened ? 'idle' : 'failed'),
      (error: unknown) => {
        console.error('Open in lab failed', error)
        setOpenInLab('failed')
      },
    )
  }

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 sm:py-10">
        <section
          aria-labelledby="solutionReportTitle"
          className="flex flex-col items-center gap-3 rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 px-5 py-8 text-center text-white shadow-lg"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
            <CircleCheck className="h-8 w-8" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-50">{t('verified')}</p>
          <h1 id="solutionReportTitle" className="text-2xl font-semibold sm:text-3xl">
            {t('title')}
          </h1>
          <p className="text-emerald-50">{title}</p>
          <ul aria-label={t('summaryAria')} className="flex flex-wrap justify-center gap-2 text-sm">
            <li className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1">
              <Compass className="h-4 w-4" aria-hidden="true" />
              {t('guideUsed', { used: formatNumber(guideStepsUsed), total: formatNumber(totalGuideSteps) })}
            </li>
          </ul>
          {topics.length > 0 && (
            <ul aria-label={t('topicsAria')} className="flex flex-wrap justify-center gap-1.5">
              {topics.map((topic) => (
                <li key={topic} className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-emerald-900">
                  {topic}
                </li>
              ))}
            </ul>
          )}
        </section>
        {sections.map((section) => {
          const Icon = section.icon
          return (
            <section key={section.key} className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
              <h2 className="mb-2 flex items-center gap-2 font-semibold text-fg-strong">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-muted text-accent-text">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                {t(`sections.${section.key}`)}
              </h2>
              <p className="whitespace-pre-line leading-relaxed text-fg">{explanation[section.key]}</p>
            </section>
          )
        })}
        {onOpenInLab && (
          <section className="flex flex-col items-start gap-2 rounded-2xl border border-sky-200 dark:border-sky-800 bg-accent-muted p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-sky-900 dark:text-sky-200">{t('openInLab.hint')}</p>
            <button
              type="button"
              onClick={handleOpenInLab}
              disabled={openInLab === 'busy'}
              className={`flex shrink-0 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60 ${focusRing}`}
            >
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
              {t('nav.openInLab')}
            </button>
            {openInLab === 'failed' && (
              <p role="alert" className="text-sm text-rose-800 dark:text-rose-200">
                {t('openInLab.failed')}
              </p>
            )}
          </section>
        )}
        <ShareOnLinkedIn />
        <nav aria-label={t('nav.aria')} className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
          <button type="button" onClick={onBackToList} className={secondaryButton}>
            <List className="h-4 w-4" aria-hidden="true" />
            {t('nav.backToList')}
          </button>
          <button type="button" onClick={onSolveAgain} className={secondaryButton}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t('nav.solveAgain')}
          </button>
          {onNext && (
            <button
              type="button"
              onClick={onNext}
              className={`flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-medium text-white hover:bg-accent-hover ${focusRing}`}
            >
              {t('nav.next')}
              <ArrowRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
            </button>
          )}
        </nav>
      </main>
    </div>
  )
}

export default ResultScreen
