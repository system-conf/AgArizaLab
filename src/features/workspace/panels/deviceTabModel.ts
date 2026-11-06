import type { Device } from '../../../domain'
import type { ExerciseLockPolicy } from '../labServices'

export type DeviceTab = 'info' | 'settings' | 'terminal'

/** Tabs available for a device: settings unless the exercise hides them, terminal where there is one. */
export function availableDeviceTabs(device: Device, policy: ExerciseLockPolicy, hasTerminal: boolean): DeviceTab[] {
  const tabs: DeviceTab[] = ['info']
  if (policy.deviceAccess(device.id) !== 'hidden') tabs.push('settings')
  if (hasTerminal) tabs.push('terminal')
  return tabs
}
