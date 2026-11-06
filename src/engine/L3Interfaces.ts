import type { AddressingMode, Device } from '../domain'
import { Ipv4 } from './Ipv4'

/**
 * - `nic`: end-device NIC (host port)
 * - `routed`: physical routed port; serves untagged frames
 * - `subInterface`: dot1Q sub-interface of a routed port
 * - `svi`: switch virtual interface `Vlan<n>`
 */
export type L3InterfaceKind = 'nic' | 'routed' | 'subInterface' | 'svi'

/** One layer-3 interface of a device: an address the device answers on and sends from. */
export interface L3Interface {
  deviceId: string
  /** Port id, sub-interface id or 'Vlan<n>' (the ids static routes use). */
  id: string
  kind: L3InterfaceKind
  /** Physical port the interface sends through; absent for SVIs. */
  portId?: string
  /** dot1Q VLAN of a sub-interface, VLAN of an SVI. */
  vlan?: number
  /** Native sub-interface: also takes untagged frames. */
  native: boolean
  /** Own administrative state (a sub-interface also needs its port up, see InterfaceStatus). */
  adminUp: boolean
  addressing: AddressingMode
  /** '' = none. */
  address: string
  mask: string
}

/** Lists and classifies the layer-3 interfaces of devices. */
export class L3Interfaces {
  private static readonly cache = new WeakMap<Device, L3Interface[]>()

  /** Ports in device order (a routed port before its sub-interfaces), then SVIs. */
  static of(device: Device): readonly L3Interface[] {
    let list = L3Interfaces.cache.get(device)
    if (!list) {
      list = L3Interfaces.build(device)
      L3Interfaces.cache.set(device, list)
    }
    return list
  }

  static find(device: Device, interfaceId: string): L3Interface | undefined {
    return L3Interfaces.of(device).find((candidate) => candidate.id === interfaceId)
  }

  /** NICs of an end device. */
  static nics(device: Device): L3Interface[] {
    return L3Interfaces.of(device).filter((candidate) => candidate.kind === 'nic')
  }

  /** `ip routing`: the device forwards between its interfaces. */
  static isRouter(device: Device): boolean {
    return device.routing?.ipRouting === true
  }

  /** Router-side interface (routed port, sub-interface, SVI): answers ARP for its address always. */
  static isNetworkSide(iface: L3Interface): boolean {
    return iface.kind !== 'nic'
  }

  /** A valid address with a valid mask: the interface has a connected subnet. */
  static isAddressed(iface: L3Interface): boolean {
    return Ipv4.isValid(iface.address) && Ipv4.isValidMask(iface.mask)
  }

  static key(iface: L3Interface): string {
    return `${iface.deviceId}/${iface.id}`
  }

  private static build(device: Device): L3Interface[] {
    const list: L3Interface[] = []
    const base = { deviceId: device.id, native: false }
    for (const port of device.ports) {
      if (port.role === 'host' || port.role === 'routed') {
        const { addressing, address, mask } = port.l3.ipv4
        list.push({ ...base, id: port.id, kind: port.role === 'host' ? 'nic' : 'routed', portId: port.id, adminUp: port.adminUp, addressing, address, mask })
      }
      if (port.role !== 'routed') continue
      for (const sub of port.subInterfaces) {
        const { addressing, address, mask } = sub.l3.ipv4
        list.push({
          ...base,
          id: sub.id,
          kind: 'subInterface',
          portId: port.id,
          vlan: sub.vlan,
          native: sub.native === true,
          adminUp: sub.adminUp,
          addressing,
          address,
          mask,
        })
      }
    }
    for (const svi of device.switching?.svis ?? []) {
      const { addressing, address, mask } = svi.l3.ipv4
      list.push({ ...base, id: `Vlan${svi.vlan}`, kind: 'svi', vlan: svi.vlan, adminUp: svi.adminUp, addressing, address, mask })
    }
    return list
  }
}
