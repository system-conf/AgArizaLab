import type { DeviceV2, NetworkStateV2 } from '../../domain/v2'
import { L3Interfaces } from './L3Interfaces'
import { TopologyV2 } from './TopologyV2'

/** Read-only address lookups over a NetworkStateV2 shared by the v2 engine classes. */
export class DeviceAddressesV2 {
  /** Every address a device is configured with: NICs, routed ports, sub-interfaces, SVIs (in that order). */
  static of(device: DeviceV2): string[] {
    return L3Interfaces.of(device)
      .map((iface) => iface.address)
      .filter((address) => address !== '')
  }

  static has(device: DeviceV2, ip: string): boolean {
    return DeviceAddressesV2.of(device).includes(ip)
  }

  /** The device at the end of a reach path, when it is the one answering on `ip`. */
  static answeringDevice(state: NetworkStateV2, path: readonly string[], ip: string): DeviceV2 | undefined {
    const lastId = path[path.length - 1]
    const last = lastId === undefined ? undefined : TopologyV2.of(state).find(lastId)
    return last && DeviceAddressesV2.has(last, ip) ? last : undefined
  }

  /** Every address in use anywhere in the network, except on `exceptDeviceId`. */
  static usedAddresses(state: NetworkStateV2, exceptDeviceId?: string): Set<string> {
    return new Set(
      state.devices.filter((device) => device.id !== exceptDeviceId).flatMap((device) => DeviceAddressesV2.of(device)),
    )
  }
}
