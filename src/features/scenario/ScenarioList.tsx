import { useTranslation } from 'react-i18next'
import SiteHeader from '../layout/SiteHeader'
import HowTheLabWorks from './HowTheLabWorks'
import LandingFooter from './LandingFooter'
import LandingHero from './LandingHero'
import ScenarioCard from './ScenarioCard'
import type { ScenarioListItem } from './scenarioListItem'

interface ScenarioListProps {
  items: ScenarioListItem[]
  onStart: (scenarioId: string) => void
}

const exercisesSectionId = 'exercises'

/** Start page: header, hero, how the lab works, exercise cards and footer. */
function ScenarioList({ items, onStart }: ScenarioListProps) {
  const { t } = useTranslation('landing')
  const sorted = [...items].sort((a, b) => a.order - b.order)
  const completedCount = items.filter((item) => item.completed).length

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-6 sm:py-10">
        <LandingHero completed={completedCount} total={items.length} exercisesAnchorId={exercisesSectionId} />
        <HowTheLabWorks />
        <section id={exercisesSectionId} aria-labelledby="exercisesTitle" className="flex scroll-mt-20 flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="exercisesTitle" className="text-lg font-semibold text-slate-900">
              {t('exercisesHeading')}
            </h2>
            <p className="text-sm text-slate-500">{t('exercisesHint')}</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((item) => (
              <li key={item.id}>
                <ScenarioCard item={item} onStart={onStart} />
              </li>
            ))}
          </ul>
        </section>
        <LandingFooter />
      </main>
    </div>
  )
}

export default ScenarioList
