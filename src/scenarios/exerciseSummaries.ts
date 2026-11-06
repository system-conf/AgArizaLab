// Light exercise metadata for the exercise list and the solution report (main chunk): ids, order and
// setting without the networks' v2 migration. Texts come from the `exercises` namespace.
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ExerciseSetting, ExerciseTexts } from '../domain/v2'
import { V1_SETTING_MAP } from '../lab/migrations/v1DeviceMap'
import { ExerciseTextReader } from './ExerciseTextReader'
import { scenarioDefinitions } from './scenarioDefinitions'

export interface ExerciseSummary {
  id: string
  order: number
  setting: ExerciseSetting
  texts: ExerciseTexts
}

/** Every exercise (sorted by order) with its texts in the active language. */
export function useExerciseSummaries(): ExerciseSummary[] {
  const { t } = useTranslation('exercises')
  return useMemo(() => {
    const reader = new ExerciseTextReader(t)
    return scenarioDefinitions.map((definition) => ({
      id: definition.id,
      order: definition.order,
      setting: V1_SETTING_MAP[definition.setting],
      texts: reader.texts(definition.id),
    }))
  }, [t])
}
