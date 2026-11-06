import type { Device } from '../../../domain'
// CI (CLI integration): the device CLI's "CLI" and "Config" tabs.
import { CliAccess, type CliDeviceTab } from '../../cli'
import type { ExerciseLockPolicy } from '../labServices'

export type DeviceTab = 'info' | 'settings' | 'terminal' | CliDeviceTab

/** Tabs available for a device: settings unless the exercise hides them, CLI / Config on IOS devices, terminal where there is one. */
export function availableDeviceTabs(device: Device, policy: ExerciseLockPolicy, hasTerminal: boolean): DeviceTab[] {
  const tabs: DeviceTab[] = ['info']
  if (policy.deviceAccess(device.id) !== 'hidden') tabs.push('settings')
  tabs.push(...CliAccess.tabs(device, policy))
  if (hasTerminal) tabs.push('terminal')
  return tabs
}
