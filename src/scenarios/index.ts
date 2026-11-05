import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Scenario } from '../domain/ScenarioTypes'
import { ScenarioLocalizer } from './ScenarioLocalizer'
import { scenarioDefinitions } from './scenarioDefinitions'

export { scenarioDefinitions } from './scenarioDefinitions'
export { ScenarioLocalizer, localizeScenario } from './ScenarioLocalizer'

/**
 * Every exercise in the active UI language, sorted by order. Memoized per language: `t` from
 * useTranslation changes identity only when the language changes, which re-runs the localizer.
 */
export function useLocalizedScenarios(): Scenario[] {
  const { t } = useTranslation('exercises')
  return useMemo(() => {
    const localizer = new ScenarioLocalizer(t)
    return scenarioDefinitions.map((definition) => localizer.localize(definition))
  }, [t])
}
