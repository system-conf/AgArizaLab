import type { Device } from '../../../domain'
// Loaded with the workspace: reads only the model's capability, so the CLI itself loads on demand.
import { DeviceConfigText } from '../../../cli/config/DeviceConfigText'
import type { ExerciseLockPolicy } from '../../../session/ExerciseLockPolicy'

/** Device tabs the CLI feature adds: the console and the running / startup config view. */
export type CliDeviceTab = 'cli' | 'config'

/**
 * Where the device CLI is offered and which of its changes an exercise allows (docs/CLI.md §5.2). Routers,
 * managed switches and L3 switches (`deviceCli`) have a console unless the exercise hides their terminal;
 * a read-only terminal or setting still runs show commands but refuses the configuration change.
 */
export class CliAccess {
  /** The model has an IOS command line. */
  static hasCli(device: Device): boolean {
    return DeviceConfigText.hasCli(device)
  }

  static tabs(device: Device, policy: ExerciseLockPolicy): CliDeviceTab[] {
    if (!CliAccess.hasCli(device)) return []
    const tabs: CliDeviceTab[] = []
    if (policy.sectionAccess(device.id, 'terminal') !== 'hidden') tabs.push('cli')
    if (policy.deviceAccess(device.id) !== 'hidden') tabs.push('config')
    return tabs
  }

  /** Every configuration command is refused (the terminal is read-only in this exercise). */
  static readOnly(device: Device, policy: ExerciseLockPolicy): boolean {
    return policy.sectionAccess(device.id, 'terminal') !== 'editable'
  }

  /** Whether the console may apply `after` (a command's result) to the lab's `before`. */
  static allowsChange(policy: ExerciseLockPolicy, before: Device, after: Device): boolean {
    return !CliAccess.readOnly(before, policy) && policy.allowsDeviceUpdate(before, after)
  }
}
