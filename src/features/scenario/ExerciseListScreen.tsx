import { useTranslation } from 'react-i18next'
import DesignTasksCallout from '../design/list/DesignTasksCallout'
import LandingFooter from '../landing/LandingFooter'
import SamplesCallout from '../samples/SamplesCallout'
import SiteHeader from '../layout/SiteHeader'
import { useDocumentMeta } from '../layout/useDocumentMeta'
import ProgressBar from './ProgressBar'
import ScenarioCard from './ScenarioCard'
import type { ScenarioListItem } from './scenarioListItem'

interface ExerciseListScreenProps {
  items: ScenarioListItem[]
  onStart: (exerciseId: string) => void
}

/** `/exercises`: what the exercises are, progress and one card per exercise. */
function ExerciseListScreen({ items, onStart }: ExerciseListScreenProps) {
  const { t } = useTranslation('landing')
  useDocumentMeta(t('exercisesTitle'))
  const sorted = [...items].sort((a, b) => a.order - b.order)
  const completedCount = items.filter((item) => item.completed).length

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:py-10">
        <section aria-labelledby="exercisesTitle" className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 id="exercisesTitle" className="text-2xl font-semibold text-fg-strong">
              {t('exercisesTitle')}
            </h1>
            <p className="max-w-3xl text-sm leading-relaxed text-fg-muted sm:text-base">{t('exercisesLead')}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <ProgressBar completed={completedCount} total={items.length} />
          </div>
          <p className="text-sm text-fg-subtle">{t('exercisesHint')}</p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((item) => (
              <li key={item.id}>
                <ScenarioCard item={item} onStart={onStart} />
              </li>
            ))}
          </ul>
          {/* Design (D2): link to the design tasks */}
          <DesignTasksCallout />
          {/* SL1 (sample labs): link to the samples */}
          <SamplesCallout />
        </section>
        <LandingFooter />
      </main>
    </div>
  )
}

export default ExerciseListScreen
