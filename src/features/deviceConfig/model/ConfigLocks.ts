// Exercise locks of one device (MODEL_V2 §10) for the configuration UI: a per-device view of
// ExerciseLockPolicy, which holds the only lock rules (device → section → port, strictest wins).
// The panel's own `readOnly` flag turns every editable area read-only but never reveals a hidden one.
import type { DeviceSection } from '../../../domain'
import { ExerciseLockPolicy, strictest, type EditAccess } from '../../../session/ExerciseLockPolicy'

export type ConfigAccess = EditAccess

export class ConfigLocks {
  private readonly deviceId: string
  private readonly policy: ExerciseLockPolicy
  private readonly readOnly: boolean

  /** `policy`: the exercise's locks (all devices); only entries for `deviceId` apply. */
  constructor(deviceId: string, policy: ExerciseLockPolicy = ExerciseLockPolicy.none, readOnly = false) {
    this.deviceId = deviceId
    this.policy = policy
    this.readOnly = readOnly
  }

  /** Every setting of the device (also the device name, which has no section of its own). */
  device(): ConfigAccess {
    return this.withPanelFlag(this.policy.deviceAccess(this.deviceId))
  }

  section(section: DeviceSection): ConfigAccess {
    return this.withPanelFlag(this.policy.sectionAccess(this.deviceId, section))
  }

  /** One port: the 'ports' section plus any lock on the port itself. */
  port(portId: string): ConfigAccess {
    return this.withPanelFlag(this.policy.portAccess(this.deviceId, portId))
  }

  private withPanelFlag(access: ConfigAccess): ConfigAccess {
    return this.readOnly ? strictest(access, 'readOnly') : access
  }
}
