import type { Device, DeviceKind } from '../domain'

/**
 * Which devices offer the Windows-style command prompt: computers and POS terminals run Windows,
 * an NVR has a built-in network test. Printers, cameras, displays, phones and tablets do not.
 */
export class TerminalAvailability {
  static readonly kinds: ReadonlySet<DeviceKind> = new Set<DeviceKind>(['pc', 'laptop', 'server', 'pos', 'nvr'])

  /** True when the device has host settings and is of a kind that has a terminal. */
  static isAvailable(device: Device): boolean {
    return device.host !== undefined && TerminalAvailability.kinds.has(device.kind)
  }
}
