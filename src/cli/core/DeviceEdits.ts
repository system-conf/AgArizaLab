// Pure edits of a Device for command handlers: every function returns a new Device and never mutates.
// Unknown ids are programmer errors (handlers resolve the interface first and print IOS errors).
import type {
  Device,
  L3Settings,
  ManagementSettings,
  Port,
  RoutedPort,
  SubInterface,
  Svi,
  SwitchedPort,
} from '../../domain'
import { InterfaceNames } from './InterfaceNames'
import { managementOf } from './CliPrompt'

/** Fields every interface kind shares: admin state and description. */
interface InterfaceCommon {
  adminUp: boolean
  description?: string
}

function withDescription<Value extends InterfaceCommon>(value: Value, description: string | undefined): Value {
  const copy = { ...value }
  if (description === undefined || description === '') delete copy.description
  else copy.description = description
  return copy
}

export class DeviceEdits {
  static updateManagement(device: Device, change: (management: ManagementSettings) => ManagementSettings): Device {
    return { ...device, features: { ...device.features, management: change(managementOf(device)) } }
  }

  static updatePort(device: Device, portId: string, change: (port: Port) => Port): Device {
    if (!device.ports.some((port) => port.id === portId)) throw new Error(`Device ${device.id} has no port ${portId}`)
    return { ...device, ports: device.ports.map((port) => (port.id === portId ? change(port) : port)) }
  }

  static updateRoutedPort(device: Device, portId: string, change: (port: RoutedPort) => RoutedPort): Device {
    return DeviceEdits.updatePort(device, portId, (port) => {
      if (port.role !== 'routed') throw new Error(`Port ${portId} of ${device.id} is not routed`)
      return change(port)
    })
  }

  static updateSwitchedPort(device: Device, portId: string, change: (port: SwitchedPort) => SwitchedPort): Device {
    return DeviceEdits.updatePort(device, portId, (port) => {
      if (port.role !== 'switched') throw new Error(`Port ${portId} of ${device.id} is not a switchport`)
      return change(port)
    })
  }

  /** Changes a sub-interface; `create` makes it first when the parent has none with this id (C3: encapsulation). */
  static updateSubInterface(
    device: Device,
    subId: string,
    change: (sub: SubInterface) => SubInterface,
    create?: () => SubInterface,
  ): Device {
    const parentId = subId.slice(0, subId.lastIndexOf('.'))
    return DeviceEdits.updateRoutedPort(device, parentId, (port) => {
      const existing = port.subInterfaces.find((sub) => sub.id === subId)
      if (existing !== undefined) {
        return { ...port, subInterfaces: port.subInterfaces.map((sub) => (sub.id === subId ? change(sub) : sub)) }
      }
      if (create === undefined) throw new Error(`Device ${device.id} has no sub-interface ${subId}`)
      return { ...port, subInterfaces: [...port.subInterfaces, change(create())] }
    })
  }

  static removeSubInterface(device: Device, subId: string): Device {
    const parentId = subId.slice(0, subId.lastIndexOf('.'))
    return DeviceEdits.updateRoutedPort(device, parentId, (port) => ({
      ...port,
      subInterfaces: port.subInterfaces.filter((sub) => sub.id !== subId),
    }))
  }

  /** Changes an SVI; `create` adds it first when missing (`interface vlan 10`). Needs a VLAN database. */
  static updateSvi(device: Device, vlan: number, change: (svi: Svi) => Svi, create?: () => Svi): Device {
    const switching = device.switching
    if (switching === undefined) throw new Error(`Device ${device.id} has no switching settings`)
    const existing = switching.svis.find((svi) => svi.vlan === vlan)
    if (existing === undefined && create === undefined) throw new Error(`Device ${device.id} has no SVI Vlan${vlan}`)
    const svis =
      existing === undefined && create !== undefined
        ? [...switching.svis, change(create())].sort((a, b) => a.vlan - b.vlan)
        : switching.svis.map((svi) => (svi.vlan === vlan ? change(svi) : svi))
    return { ...device, switching: { ...switching, svis } }
  }

  static removeSvi(device: Device, vlan: number): Device {
    const switching = device.switching
    if (switching === undefined) return device
    return { ...device, switching: { ...switching, svis: switching.svis.filter((svi) => svi.vlan !== vlan) } }
  }

  /** `shutdown` / `no shutdown` on a port, sub-interface or SVI. */
  static setAdminUp(device: Device, interfaceId: string, adminUp: boolean): Device {
    return DeviceEdits.updateCommon(device, interfaceId, (value) => ({ ...value, adminUp }))
  }

  /** `description` / `no description` (undefined or '' removes it). */
  static setDescription(device: Device, interfaceId: string, description: string | undefined): Device {
    return DeviceEdits.updateCommon(device, interfaceId, (value) => withDescription(value, description))
  }

  /** The layer-3 settings of a routed port, sub-interface or SVI. */
  static updateL3(device: Device, interfaceId: string, change: (l3: L3Settings) => L3Settings): Device {
    const svi = DeviceEdits.sviVlan(interfaceId)
    if (svi !== null) return DeviceEdits.updateSvi(device, svi, (value) => ({ ...value, l3: change(value.l3) }))
    if (interfaceId.includes('.')) return DeviceEdits.updateSubInterface(device, interfaceId, (sub) => ({ ...sub, l3: change(sub.l3) }))
    return DeviceEdits.updateRoutedPort(device, interfaceId, (port) => ({ ...port, l3: change(port.l3) }))
  }

  private static updateCommon(device: Device, interfaceId: string, change: <Value extends InterfaceCommon>(value: Value) => Value): Device {
    const svi = DeviceEdits.sviVlan(interfaceId)
    if (svi !== null) return DeviceEdits.updateSvi(device, svi, change)
    if (interfaceId.includes('.')) return DeviceEdits.updateSubInterface(device, interfaceId, change)
    return DeviceEdits.updatePort(device, interfaceId, change)
  }

  /** 'Vlan10' → 10; null for other ids. */
  private static sviVlan(interfaceId: string): number | null {
    const parsed = InterfaceNames.parse(interfaceId)
    return parsed?.type === 'Vlan' ? Number(parsed.number) : null
  }
}
