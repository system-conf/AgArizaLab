import type { Device, DeviceKind } from '../domain/NetworkTypes'

/**
 * Which devices offer a command line. PCs and POS terminals run Windows; an NVR has a built-in
 * network test. Printers, cameras, kitchen displays and phones do not, so the game hides it there.
 */
export class TerminalAvailability {
  static readonly kinds: ReadonlySet<DeviceKind> = new Set<DeviceKind>(['pc', 'pos', 'nvr'])

  /** True when the device has an IP configuration and is of a kind that has a terminal. */
  static isAvailable(device: Device): boolean {
    return device.host !== undefined && TerminalAvailability.kinds.has(device.kind)
  }
}
