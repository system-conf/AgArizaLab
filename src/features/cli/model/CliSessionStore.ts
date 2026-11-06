import type { Device } from '../../../domain'
import type { CliShell } from '../cliServices'
import { CliConsole } from './CliConsole'

/**
 * The console windows of the open lab, one per device, outside React so a console keeps its session and
 * transcript while the learner selects other devices or tabs. Opening another lab starts with none
 * (device ids repeat between labs). An external store for `useSyncExternalStore`.
 */
export class CliSessionStore {
  private readonly shell: CliShell
  private labId: string | null = null
  private consoles = new Map<string, CliConsole>()
  private readonly listeners = new Set<() => void>()

  constructor(shell: CliShell) {
    this.shell = shell
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** The device's console in lab `labId`; opened on `device` the first time (no notification). */
  consoleOf(labId: string, device: Device): CliConsole {
    this.follow(labId)
    const existing = this.consoles.get(device.id)
    if (existing) return existing
    const opened = CliConsole.open(this.shell, device)
    this.consoles.set(device.id, opened)
    return opened
  }

  /** The device's console if it is open in lab `labId`. */
  find(labId: string, deviceId: string): CliConsole | undefined {
    return this.labId === labId ? this.consoles.get(deviceId) : undefined
  }

  set(labId: string, deviceId: string, console: CliConsole): void {
    this.follow(labId)
    if (this.consoles.get(deviceId) === console) return
    this.consoles.set(deviceId, console)
    for (const listener of this.listeners) listener()
  }

  private follow(labId: string): void {
    if (this.labId === labId) return
    this.labId = labId
    this.consoles = new Map()
  }
}
