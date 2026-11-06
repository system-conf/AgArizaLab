import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Exercise } from '../domain'
import { exerciseDefinitions } from './exerciseDefinitions'
import { ExerciseLocalizer } from './ExerciseLocalizer'

/**
 * Every exercise in the active UI language, sorted by order. Memoized per language: `t` from
 * useTranslation changes identity only when the language changes, which re-runs the localizer
 * (the exercise screen then relabels its open lab).
 */
export function useLocalizedExercises(): Exercise[] {
  const { t } = useTranslation('exercises')
  return useMemo(() => {
    const localizer = new ExerciseLocalizer(t)
    return exerciseDefinitions.map((definition) => localizer.localize(definition))
  }, [t])
}
