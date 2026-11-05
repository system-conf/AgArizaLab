import type { AriaLabelConfig } from '@xyflow/react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Screen-reader labels and tooltips for React Flow's built-in parts in the current language.
 * Rebuilt when the language changes (t changes identity then).
 */
export function useMapAriaLabels(): Partial<AriaLabelConfig> {
  const { t } = useTranslation('map')
  return useMemo(
    () => ({
      'node.a11yDescription.default': t('reactFlow.nodeDescription'),
      'node.a11yDescription.keyboardDisabled': t('reactFlow.nodeDescriptionKeyboardDisabled'),
      'node.a11yDescription.ariaLiveMessage': ({ x, y }) => t('reactFlow.nodeMoved', { x, y }),
      'edge.a11yDescription.default': t('reactFlow.edgeDescription'),
      'controls.ariaLabel': t('reactFlow.controls'),
      'controls.zoomIn.ariaLabel': t('reactFlow.zoomIn'),
      'controls.zoomOut.ariaLabel': t('reactFlow.zoomOut'),
      'controls.fitView.ariaLabel': t('reactFlow.fitView'),
      'controls.interactive.ariaLabel': t('reactFlow.interactive'),
      'minimap.ariaLabel': t('reactFlow.minimap'),
      'handle.ariaLabel': t('reactFlow.handle'),
    }),
    [t],
  )
}
