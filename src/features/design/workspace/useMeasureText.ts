import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { RequirementMeasure } from '../../../design'
import { useNumberFormat } from '../../layout/useNumberFormat'

/** "3 / 5 devices" for a requirement's progress in the live checklist. */
export function useMeasureText(): (measure: RequirementMeasure) => string {
  const { t } = useTranslation('design')
  const formatNumber = useNumberFormat()
  return useCallback(
    (measure: RequirementMeasure) => t(`ui.measure.${measure.unit}`, { value: formatNumber(measure.value), limit: formatNumber(measure.limit) }),
    [formatNumber, t],
  )
}
