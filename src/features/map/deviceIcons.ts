import type { DeviceKind } from '../../domain/NetworkTypes'
import { deviceIconFor, type DeviceIcon } from '../../catalog'

export { deviceIconFor, type DeviceIcon } from '../../catalog'

/**
 * Icon shown for each v1 device kind on the map and in the device panel: the v2 icon of the kind
 * the migration maps it to (v1 'phone' → 'smartphone'), so v1 and v2 screens look the same.
 */
export const deviceIcons: Record<DeviceKind, DeviceIcon> = {
  internet: deviceIconFor('internet'),
  router: deviceIconFor('router'),
  switch: deviceIconFor('switch'),
  accessPoint: deviceIconFor('accessPoint'),
  pc: deviceIconFor('pc'),
  pos: deviceIconFor('pos'),
  printer: deviceIconFor('printer'),
  camera: deviceIconFor('camera'),
  nvr: deviceIconFor('nvr'),
  kitchenDisplay: deviceIconFor('kitchenDisplay'),
  phone: deviceIconFor('smartphone'),
}
