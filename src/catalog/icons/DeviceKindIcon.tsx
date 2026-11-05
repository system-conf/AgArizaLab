import type { DeviceKindV2 } from '../../domain/v2'
import { deviceIconRegistry } from './deviceIconRegistry'
import type { DeviceIconProps } from './deviceIconTypes'

interface DeviceKindIconProps extends DeviceIconProps {
  kind: DeviceKindV2
}

/**
 * Renders the icon of a device kind. Prefer this in components: `const Icon = deviceIconFor(kind)`
 * inside render trips the `react-hooks/static-components` lint rule.
 */
export function DeviceKindIcon({ kind, ...props }: DeviceKindIconProps) {
  const Icon = deviceIconRegistry[kind]
  return <Icon {...props} />
}
