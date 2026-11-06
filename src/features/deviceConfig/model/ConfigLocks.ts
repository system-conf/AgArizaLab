// Exercise locks of one device (MODEL_V2 §10) resolved for the configuration UI. The strictest
// applicable lock wins: device → section → port. The panel's own `readOnly` flag turns every
// editable area read-only but never reveals a hidden one.
import type { DeviceSection, ExerciseLock, LockAccess } from '../../../domain'

export type ConfigAccess = 'editable' | LockAccess

const RANK: Record<ConfigAccess, number> = { editable: 0, readOnly: 1, hidden: 2 }

function strictest(...accesses: ConfigAccess[]): ConfigAccess {
  return accesses.reduce<ConfigAccess>((worst, access) => (RANK[access] > RANK[worst] ? access : worst), 'editable')
}

export class ConfigLocks {
  private readonly deviceId: string
  private readonly locks: readonly ExerciseLock[]
  private readonly readOnly: boolean

  /** `locks`: the whole `ExerciseDefinition.locks` list; only entries for `deviceId` apply. */
  constructor(deviceId: string, locks: readonly ExerciseLock[] = [], readOnly = false) {
    this.deviceId = deviceId
    this.locks = locks
    this.readOnly = readOnly
  }

  /** Every setting of the device (also the device name, which has no section of its own). */
  device(): ConfigAccess {
    const own = this.locks.flatMap((lock) => (lock.scope === 'device' && lock.deviceId === this.deviceId ? [lock.access] : []))
    return this.withPanelFlag(strictest(...own))
  }

  section(section: DeviceSection): ConfigAccess {
    const own = this.locks.flatMap((lock) =>
      lock.scope === 'section' && lock.deviceId === this.deviceId && lock.section === section ? [lock.access] : [],
    )
    return strictest(this.device(), ...own)
  }

  /** One port: the 'ports' section plus any lock on the port itself. */
  port(portId: string): ConfigAccess {
    const own = this.locks.flatMap((lock) =>
      lock.scope === 'port' && lock.deviceId === this.deviceId && lock.portId === portId ? [lock.access] : [],
    )
    return strictest(this.section('ports'), ...own)
  }

  private withPanelFlag(access: ConfigAccess): ConfigAccess {
    return this.readOnly ? strictest(access, 'readOnly') : access
  }
}
