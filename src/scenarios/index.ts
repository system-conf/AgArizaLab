import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Scenario } from '../domain/ScenarioTypes'
import { ScenarioLocalizer } from './ScenarioLocalizer'
import { scenarioDefinitions } from './scenarioDefinitions'

export { scenarioDefinitions } from './scenarioDefinitions'
export { ScenarioLocalizer, localizeScenario } from './ScenarioLocalizer'
export { ExerciseLocalizer } from './ExerciseLocalizer'
export { ExerciseTextReader } from './ExerciseTextReader'
export { useExerciseSummaries, type ExerciseSummary } from './exerciseSummaries'
// v2 exercise definitions (with the migration) are imported from './exerciseDefinitions' and
// './useLocalizedExercises' directly by the lazy exercise screen, never through this index.

/**
 * v1: every exercise as a v1 Scenario in the active UI language, sorted by order. No longer used
 * by the app (it runs exercises on v2: useLocalizedExercises); removed with the v1 types.
 */
export function useLocalizedScenarios(): Scenario[] {
  const { t } = useTranslation('exercises')
  return useMemo(() => {
    const localizer = new ScenarioLocalizer(t)
    return scenarioDefinitions.map((definition) => localizer.localize(definition))
  }, [t])
}
