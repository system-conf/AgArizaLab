// The configurable interfaces of a device as the CLI sees them: switched / routed ports, sub-interfaces, SVIs.
import type { Device, RoutedPort, SwitchedPort } from '../../domain'
import type { CliInterface, CliInterfaceName } from '../contract'
import { InterfaceNames } from './InterfaceNames'

function isConfigurable(port: Device['ports'][number]): port is SwitchedPort | RoutedPort {
  return port.role === 'switched' || port.role === 'routed'
}

export class DeviceInterfaces {
  /** IOS order: ports in device order (each routed port followed by its sub-interfaces), then SVIs by VLAN. */
  static list(device: Device): CliInterface[] {
    const interfaces: CliInterface[] = []
    for (const port of device.ports) {
      if (!isConfigurable(port)) continue
      interfaces.push({ kind: 'port', id: port.id, port })
      if (port.role !== 'routed') continue
      for (const sub of port.subInterfaces) interfaces.push({ kind: 'subInterface', id: sub.id, parent: port, sub })
    }
    const svis = [...(device.switching?.svis ?? [])].sort((a, b) => a.vlan - b.vlan)
    for (const svi of svis) interfaces.push({ kind: 'svi', id: `Vlan${svi.vlan}`, svi })
    return interfaces
  }

  /** The interface with this id ('Gi0/0', 'gi0/0', 'Vlan10', 'Gi0/0.10'); undefined when the device has none. */
  static find(device: Device, id: string): CliInterface | undefined {
    return DeviceInterfaces.list(device).find((iface) => InterfaceNames.sameId(iface.id, id))
  }

  static resolve(device: Device, name: CliInterfaceName): CliInterface | undefined {
    return DeviceInterfaces.find(device, name.id)
  }

  /** The device's own spelling of a typed name ('gi0/0' → the port id 'Gi0/0'); the name's id when unknown. */
  static idOf(device: Device, name: CliInterfaceName): string {
    return DeviceInterfaces.resolve(device, name)?.id ?? name.id
  }

  /** The routed port a sub-interface name belongs to ('Gi0/0.10' → port 'Gi0/0'). */
  static parentOf(device: Device, name: CliInterfaceName): RoutedPort | undefined {
    if (name.subInterface === undefined) return undefined
    const parentId = name.id.slice(0, name.id.lastIndexOf('.'))
    const parent = DeviceInterfaces.find(device, parentId)
    return parent?.kind === 'port' && parent.port.role === 'routed' ? parent.port : undefined
  }
}
