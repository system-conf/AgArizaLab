import type { Device, NetworkState } from '../domain/NetworkTypes'

/** Read-only lookups over a NetworkState shared by the engine classes. */
export class DeviceLookup {
  /** Unknown ids are programmer errors (UI and scenarios only pass ids from the state). */
  static require(state: NetworkState, deviceId: string): Device {
    const device = state.devices.find((candidate) => candidate.id === deviceId)
    if (!device) throw new Error(`Unknown device id: ${deviceId}`)
    return device
  }

  static find(state: NetworkState, deviceId: string): Device | undefined {
    return state.devices.find((candidate) => candidate.id === deviceId)
  }

  /** Every address a device answers on: its host ip or its router interface ips. */
  static addressesOf(device: Device): string[] {
    const addresses: string[] = []
    if (device.host && device.host.ip !== '') addresses.push(device.host.ip)
    for (const routerInterface of device.routerInterfaces ?? []) {
      if (routerInterface.ip !== '') addresses.push(routerInterface.ip)
    }
    return addresses
  }

  static hasAddress(device: Device, ip: string): boolean {
    return DeviceLookup.addressesOf(device).includes(ip)
  }

  /** The device at the end of a reach path, when it is the one answering on `ip`. */
  static answeringDevice(state: NetworkState, path: string[], ip: string): Device | undefined {
    const lastId = path[path.length - 1]
    const last = lastId === undefined ? undefined : DeviceLookup.find(state, lastId)
    return last && DeviceLookup.hasAddress(last, ip) ? last : undefined
  }

  /** Every address in use anywhere in the network. */
  static usedAddresses(state: NetworkState): Set<string> {
    return new Set(state.devices.flatMap((device) => DeviceLookup.addressesOf(device)))
  }
}
