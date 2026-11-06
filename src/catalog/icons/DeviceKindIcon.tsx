import type { DeviceKind } from '../../domain'
import { deviceIconRegistry, hasOwnModelIcon, modelIconOverrides } from './deviceIconRegistry'
import type { DeviceIconProps } from './deviceIconTypes'

interface DeviceKindIconProps extends DeviceIconProps {
  kind: DeviceKind
  /** Catalog model id (Device.modelId): a few models have their own icon (e.g. the smart TV). */
  modelId?: string
}

/**
 * Renders the icon of a device kind. Prefer this in components: `const Icon = deviceIconFor(kind)`
 * inside render trips the `react-hooks/static-components` lint rule.
 */
export function DeviceKindIcon({ kind, modelId, ...props }: DeviceKindIconProps) {
  if (hasOwnModelIcon(modelId)) {
    const ModelIcon = modelIconOverrides[modelId]
    return <ModelIcon {...props} />
  }
  const Icon = deviceIconRegistry[kind]
  return <Icon {...props} />
}
