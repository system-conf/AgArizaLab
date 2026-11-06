// What an exercise lab lets the learner change (MODEL_V2 §10 `ExerciseLock`). Anything not locked is
// editable; the strictest lock wins (hidden > readOnly > editable). A free lab uses `none`.
import type { Device, DeviceSection, ExerciseLock, LockAccess } from '../domain'

export type EditAccess = 'editable' | LockAccess

export interface DeletionRequest {
  deviceIds: readonly string[]
  linkIds: readonly string[]
  annotationIds: readonly string[]
}

const STRICTNESS: Readonly<Record<EditAccess, number>> = { editable: 0, readOnly: 1, hidden: 2 }

function strictest(...accesses: EditAccess[]): EditAccess {
  return accesses.reduce<EditAccess>((worst, access) => (STRICTNESS[access] > STRICTNESS[worst] ? access : worst), 'editable')
}

/** Structural equality of plain JSON-like data (key order does not matter). */
function sameData(first: unknown, second: unknown): boolean {
  if (first === second) return true
  if (typeof first !== 'object' || typeof second !== 'object' || first === null || second === null) return false
  if (Array.isArray(first) !== Array.isArray(second)) return false
  const firstRecord = first as Record<string, unknown>
  const secondRecord = second as Record<string, unknown>
  const keys = new Set([...Object.keys(firstRecord), ...Object.keys(secondRecord)])
  return [...keys].every((key) => sameData(firstRecord[key], secondRecord[key]))
}

/** Device data each lockable section covers ('terminal' covers no data: it is the command prompt). */
const SECTION_DATA: Readonly<Record<Exclude<DeviceSection, 'terminal'>, (device: Device) => unknown>> = {
  power: (device) => device.powered,
  ports: (device) => device.ports,
  host: (device) => device.host,
  switching: (device) => device.switching,
  routing: (device) => device.routing,
  wireless: (device) => device.wireless,
  services: (device) => device.services,
  internet: (device) => device.internet,
}

export class ExerciseLockPolicy {
  /** A free lab: nothing locked. */
  static readonly none = new ExerciseLockPolicy([])

  readonly locks: readonly ExerciseLock[]

  constructor(locks: readonly ExerciseLock[]) {
    this.locks = locks
  }

  get hasLocks(): boolean {
    return this.locks.length > 0
  }

  /** No devices or cables may be added, deleted or moved (palette, cable tool, delete, drag). */
  get topologyLocked(): boolean {
    return this.locks.some((lock) => lock.scope === 'topology')
  }

  canDeleteLink(linkId: string): boolean {
    return !this.topologyLocked && !this.linkLocked(linkId)
  }

  /** Plugging / unplugging keeps the cable, so only a link lock forbids it. */
  canUnplugLink(linkId: string): boolean {
    return !this.linkLocked(linkId)
  }

  deviceAccess(deviceId: string): EditAccess {
    return strictest(
      ...this.locks.flatMap((lock) => (lock.scope === 'device' && lock.deviceId === deviceId ? [lock.access] : [])),
    )
  }

  sectionAccess(deviceId: string, section: DeviceSection): EditAccess {
    const sectionLocks = this.locks.flatMap((lock) =>
      lock.scope === 'section' && lock.deviceId === deviceId && lock.section === section ? [lock.access] : [],
    )
    return strictest(this.deviceAccess(deviceId), ...sectionLocks)
  }

  /** A port is covered by its own lock, the device's 'ports' section and the device lock. */
  portAccess(deviceId: string, portId: string): EditAccess {
    const portLocks = this.locks.flatMap((lock) =>
      lock.scope === 'port' && lock.deviceId === deviceId && lock.portId === portId ? [lock.access] : [],
    )
    return strictest(this.sectionAccess(deviceId, 'ports'), ...portLocks)
  }

  /** The command prompt can be used only when the 'terminal' section is editable. */
  canUseTerminal(deviceId: string): boolean {
    return this.sectionAccess(deviceId, 'terminal') === 'editable'
  }

  /** Safety net under the settings panel: false when `after` changes anything that is locked. */
  allowsDeviceUpdate(before: Device, after: Device): boolean {
    if (before.id !== after.id) return false
    if (this.deviceAccess(before.id) !== 'editable') return sameData(before, after)
    for (const [section, dataOf] of Object.entries(SECTION_DATA)) {
      if (!this.isSection(section)) continue
      if (this.sectionAccess(before.id, section) !== 'editable' && !sameData(dataOf(before), dataOf(after))) return false
    }
    return before.ports.every((port) => {
      if (this.portAccess(before.id, port.id) === 'editable') return true
      return sameData(port, after.ports.find((candidate) => candidate.id === port.id))
    })
  }

  /** The part of a delete request the locks allow (annotations are never locked). */
  allowedDeletion(request: DeletionRequest): DeletionRequest {
    return {
      deviceIds: this.topologyLocked ? [] : request.deviceIds,
      linkIds: request.linkIds.filter((linkId) => this.canDeleteLink(linkId)),
      annotationIds: request.annotationIds,
    }
  }

  private linkLocked(linkId: string): boolean {
    return this.locks.some((lock) => lock.scope === 'link' && lock.linkId === linkId)
  }

  private isSection(section: string): section is Exclude<DeviceSection, 'terminal'> {
    return section in SECTION_DATA
  }
}
