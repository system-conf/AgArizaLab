// Test-only (O3): immutable port edits used by LabBuilder / LabHosts / LabFaults.
import type { Device, L3Settings, Port, SubInterface, SwitchportSettings } from '../../domain'

function l3(address: string, mask: string, addressing: 'static' | 'dhcp' = 'static', helperAddresses?: string[]): L3Settings {
  return { ipv4: { addressing, address, mask }, ...(helperAddresses === undefined ? {} : { helperAddresses }) }
}

export class LabPorts {
  static editPort(device: Device, portId: string, change: (port: Port) => Port): Device {
    if (!device.ports.some((port) => port.id === portId)) throw new Error(`${device.id} has no port ${portId}`)
    return { ...device, ports: device.ports.map((port) => (port.id === portId ? change(port) : port)) }
  }

  /** A routed (`no switchport`) port, enabled, with an address ('' = none) and optional sub-interfaces. */
  static routed(address: string, mask: string, subInterfaces: SubInterface[] = [], helperAddresses?: string[]): (port: Port) => Port {
    return (port) => ({
      id: port.id,
      medium: port.medium,
      ...(port.mac === undefined ? {} : { mac: port.mac }),
      role: 'routed',
      adminUp: true,
      l3: l3(address, mask, 'static', helperAddresses),
      subInterfaces,
    })
  }

  static subInterface(parentId: string, vlan: number, address: string, mask: string, native: boolean, helperAddresses?: string[]): SubInterface {
    return { id: `${parentId}.${vlan}`, vlan, ...(native ? { native: true } : {}), adminUp: true, l3: l3(address, mask, 'static', helperAddresses) }
  }

  static switchport(l2: SwitchportSettings): (port: Port) => Port {
    return (port) => {
      if (port.role !== 'switched') throw new Error(`${port.id} is not a switchport`)
      return { ...port, adminUp: true, l2 }
    }
  }

  static access(vlan: number): SwitchportSettings {
    return { mode: 'access', accessVlan: vlan, nativeVlan: 1, allowedVlans: 'all' }
  }

  static trunk(nativeVlan: number, allowedVlans: SwitchportSettings['allowedVlans']): SwitchportSettings {
    return { mode: 'trunk', accessVlan: 1, nativeVlan, allowedVlans }
  }

  /** IPv4 of a host NIC. */
  static nic(addressing: 'static' | 'dhcp', address: string, mask: string): (port: Port) => Port {
    return (port) => {
      if (port.role !== 'host') throw new Error(`${port.id} is not a NIC`)
      return { ...port, adminUp: true, l3: l3(address, mask, addressing) }
    }
  }

  static l3Settings(address: string, mask: string, helperAddresses?: string[]): L3Settings {
    return l3(address, mask, 'static', helperAddresses)
  }
}
