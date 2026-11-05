import { useEffect, useState } from 'react'
import GameScreen, { type SolvedSummary } from './features/game/GameScreen'
import ResultScreen from './features/result/ResultScreen'
import ScenarioList from './features/scenario/ScenarioList'
import type { ScenarioListItem } from './features/scenario/scenarioListItem'
import { scenarios } from './scenarios'
import { ProgressStore } from './session/ProgressStore'

type Screen =
  | { kind: 'list' }
  | { kind: 'game'; scenarioIndex: number }
  | { kind: 'result'; scenarioIndex: number; summary: SolvedSummary }

function App() {
  const [progressStore] = useState(() => ProgressStore.fromBrowser())
  const [progress, setProgress] = useState(() => progressStore.read())
  const [screen, setScreen] = useState<Screen>({ kind: 'list' })

  // Every screen starts at the top, not at the scroll position of the previous one.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screen])

  const showList = () => setScreen({ kind: 'list' })

  if (screen.kind === 'list') {
    const items: ScenarioListItem[] = scenarios.map((scenario) => ({
      id: scenario.id,
      order: scenario.order,
      title: scenario.title,
      setting: scenario.setting,
      topics: scenario.topics,
      completed: progress[scenario.id] !== undefined,
    }))
    const start = (scenarioId: string) => {
      const scenarioIndex = scenarios.findIndex((scenario) => scenario.id === scenarioId)
      if (scenarioIndex >= 0) setScreen({ kind: 'game', scenarioIndex })
    }
    return <ScenarioList items={items} onStart={start} />
  }

  const scenario = scenarios[screen.scenarioIndex]
  if (!scenario) throw new Error(`Unknown scenario index: ${screen.scenarioIndex}`)

  if (screen.kind === 'game') {
    const handleSolved = (summary: SolvedSummary) => {
      setProgress(progressStore.recordCompletion(scenario.id, summary.elapsedSeconds, summary.hintsUsed))
      setScreen({ kind: 'result', scenarioIndex: screen.scenarioIndex, summary })
    }
    return (
      <GameScreen key={scenario.id} scenario={scenario} total={scenarios.length} onBack={showList} onSolved={handleSolved} />
    )
  }

  const nextIndex = screen.scenarioIndex + 1
  const hasNext = nextIndex < scenarios.length
  return (
    <ResultScreen
      title={scenario.title}
      explanation={scenario.explanation}
      topics={scenario.topics}
      elapsedSeconds={screen.summary.elapsedSeconds}
      hintsUsed={screen.summary.hintsUsed}
      totalHints={scenario.hints.length}
      onNext={hasNext ? () => setScreen({ kind: 'game', scenarioIndex: nextIndex }) : undefined}
      onBackToList={showList}
    />
  )
}

export default App
