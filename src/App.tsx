import { useEffect, useState } from 'react'
import ExerciseScreen, { type SolvedSummary } from './features/exercise/ExerciseScreen'
import { useDocumentMeta } from './features/layout/useDocumentMeta'
import ResultScreen from './features/result/ResultScreen'
import ScenarioList from './features/scenario/ScenarioList'
import type { ScenarioListItem } from './features/scenario/scenarioListItem'
import { useLocalizedScenarios } from './scenarios'
import { ProgressStore } from './session/ProgressStore'

type Screen =
  | { kind: 'list' }
  | { kind: 'exercise'; scenarioIndex: number }
  | { kind: 'result'; scenarioIndex: number; summary: SolvedSummary }

function App() {
  const scenarios = useLocalizedScenarios()
  const [progressStore] = useState(() => ProgressStore.fromBrowser())
  const [progress, setProgress] = useState(() => progressStore.read())
  const [screen, setScreen] = useState<Screen>({ kind: 'list' })
  const openScenario = screen.kind === 'list' ? undefined : scenarios[screen.scenarioIndex]
  useDocumentMeta(openScenario?.title)

  // Every screen starts at the top, not at the scroll position of the previous one.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screen])

  const showList = () => setScreen({ kind: 'list' })
  const openExercise = (scenarioIndex: number) => setScreen({ kind: 'exercise', scenarioIndex })

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
      if (scenarioIndex >= 0) openExercise(scenarioIndex)
    }
    return <ScenarioList items={items} onStart={start} />
  }

  const scenario = openScenario
  if (!scenario) throw new Error(`Unknown scenario index: ${screen.scenarioIndex}`)

  if (screen.kind === 'exercise') {
    const handleSolved = (summary: SolvedSummary) => {
      setProgress(progressStore.recordCompletion(scenario.id, summary.guideStepsUsed))
      setScreen({ kind: 'result', scenarioIndex: screen.scenarioIndex, summary })
    }
    return (
      <ExerciseScreen key={scenario.id} scenario={scenario} total={scenarios.length} onBack={showList} onSolved={handleSolved} />
    )
  }

  const nextIndex = screen.scenarioIndex + 1
  const hasNext = nextIndex < scenarios.length
  return (
    <ResultScreen
      title={scenario.title}
      explanation={scenario.explanation}
      topics={scenario.topics}
      guideStepsUsed={screen.summary.guideStepsUsed}
      totalGuideSteps={scenario.hints.length}
      onNext={hasNext ? () => openExercise(nextIndex) : undefined}
      onSolveAgain={() => openExercise(screen.scenarioIndex)}
      onBackToList={showList}
    />
  )
}

export default App
