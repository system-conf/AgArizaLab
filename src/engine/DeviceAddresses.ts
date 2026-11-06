import type { Device, NetworkState } from '../domain'
import { L3Interfaces } from './L3Interfaces'
import { Topology } from './Topology'

/** Read-only address lookups over a NetworkState shared by the engine classes. */
export class DeviceAddresses {
  /** Every address a device is configured with: NICs, routed ports, sub-interfaces, SVIs (in that order). */
  static of(device: Device): string[] {
    return L3Interfaces.of(device)
      .map((iface) => iface.address)
      .filter((address) => address !== '')
  }

  static has(device: Device, ip: string): boolean {
    return DeviceAddresses.of(device).includes(ip)
  }

  /** The device at the end of a reach path, when it is the one answering on `ip`. */
  static answeringDevice(state: NetworkState, path: readonly string[], ip: string): Device | undefined {
    const lastId = path[path.length - 1]
    const last = lastId === undefined ? undefined : Topology.of(state).find(lastId)
    return last && DeviceAddresses.has(last, ip) ? last : undefined
  }

  /** Every address in use anywhere in the network, except on `exceptDeviceId`. */
  static usedAddresses(state: NetworkState, exceptDeviceId?: string): Set<string> {
    return new Set(
      state.devices.filter((device) => device.id !== exceptDeviceId).flatMap((device) => DeviceAddresses.of(device)),
    )
  }
}
