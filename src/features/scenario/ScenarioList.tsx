import HowToPlay from './HowToPlay'
import LandingFooter from './LandingFooter'
import LandingHero from './LandingHero'
import ScenarioCard from './ScenarioCard'
import type { ScenarioListItem } from './scenarioListItem'

interface ScenarioListProps {
  items: ScenarioListItem[]
  onStart: (scenarioId: string) => void
}

const scenariosSectionId = 'senaryolar'

/** Start page: hero, how to play, scenario cards and footer. */
function ScenarioList({ items, onStart }: ScenarioListProps) {
  const sorted = [...items].sort((a, b) => a.order - b.order)
  const completedCount = items.filter((item) => item.completed).length

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-6 sm:py-10">
        <LandingHero completed={completedCount} total={items.length} scenariosAnchorId={scenariosSectionId} />
        <HowToPlay />
        <section id={scenariosSectionId} aria-labelledby="scenariosTitle" className="flex scroll-mt-6 flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="scenariosTitle" className="text-lg font-semibold text-slate-900">
              Senaryolar
            </h2>
            <p className="text-sm text-slate-500">İstediğin senaryodan başlayabilirsin.</p>
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
