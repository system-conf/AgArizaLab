import type { DeviceKindV2, DeviceV2 } from '../../domain/v2'

/**
 * Which v2 devices offer the Windows-style command prompt: computers and POS terminals run Windows,
 * an NVR has a built-in network test. Printers, cameras, displays, phones and tablets do not.
 */
export class TerminalAvailabilityV2 {
  static readonly kinds: ReadonlySet<DeviceKindV2> = new Set<DeviceKindV2>(['pc', 'laptop', 'server', 'pos', 'nvr'])

  /** True when the device has host settings and is of a kind that has a terminal. */
  static isAvailable(device: DeviceV2): boolean {
    return device.host !== undefined && TerminalAvailabilityV2.kinds.has(device.kind)
  }
}
