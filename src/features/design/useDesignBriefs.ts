import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { DesignExercise } from '../../domain'
import { designBriefDefinitions } from './designBriefSource'
import { DesignBriefLocalizer } from './model/DesignBriefLocalizer'

/**
 * Every design brief in the active UI language, sorted by order. Memoized per language (`t` changes
 * identity only then); the design screen relabels its open lab when the brief object changes.
 */
export function useDesignBriefs(): DesignExercise[] {
  const { t } = useTranslation('design')
  return useMemo(() => {
    const localizer = new DesignBriefLocalizer(t)
    return [...designBriefDefinitions].sort((a, b) => a.order - b.order).map((definition) => localizer.localize(definition))
  }, [t])
}
