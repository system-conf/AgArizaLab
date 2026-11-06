// Read-only facts of a device for the info panel and the port strip: per-port link light,
// neighbours and settings summary, and the routing table summary. Settings hidden by an exercise
// lock come back as null so the UI cannot reveal them.
import type { AddressingMode, DeviceV2, NetworkStateV2, Port, PortMedium } from '../../../domain/v2'
import { Ipv4, L3Interfaces, networkEngineV2, RoutingTableV2, TopologyV2 } from '../../../engine'
import type { ConfigAccess, ConfigLocks } from './ConfigLocks'
import { VlanListParser } from './VlanListParser'

/** Link light of a port: like the LED next to it. */
export type PortLight = 'up' | 'down' | 'noCable' | 'unplugged'

export interface NeighbourInfo {
  deviceId: string
  deviceName: string
  portId: string
}

export interface AddressSummary {
  addressing: AddressingMode
  /** '' = none. */
  address: string
  mask: string
}

export type PortSettingsSummary =
  | { kind: 'access'; vlan: number }
  | { kind: 'trunk'; nativeVlan: number; allowed: 'all' | string }
  | { kind: 'l3'; ipv4: AddressSummary; subInterfaces: { id: string; vlan: number; ipv4: AddressSummary }[] }
  | { kind: 'none' }

export interface PortInfo {
  id: string
  medium: PortMedium
  role: Port['role']
  light: PortLight
  neighbours: NeighbourInfo[]
  access: ConfigAccess
  /** null when the port's settings are hidden. */
  adminUp: boolean | null
  settings: PortSettingsSummary | null
}

export interface RouteInfo {
  type: 'connected' | 'static'
  network: string
  prefixLength: number
  nextHop?: string
  interfaceId?: string
  adminDistance: number
}

export class DeviceInfoModel {
  static portStatus(state: NetworkStateV2, device: DeviceV2, portId: string): { light: PortLight; neighbours: NeighbourInfo[] } {
    const topology = TopologyV2.of(state)
    const links = topology.linksAt(device.id, portId)
    const neighbours = links.flatMap((link) => {
      const far = topology.farEnd(link, device.id, portId)
      return far.device ? [{ deviceId: far.device.id, deviceName: far.device.name, portId: far.end.portId }] : []
    })
    let light: PortLight = 'noCable'
    if (links.length > 0) {
      const plugged = links.filter((link) => link.connected)
      if (plugged.length === 0) light = 'unplugged'
      else light = plugged.some((link) => networkEngineV2.linkLight(state, link.id) === 'up') ? 'up' : 'down'
    }
    return { light, neighbours }
  }

  static ports(state: NetworkStateV2, device: DeviceV2, locks: ConfigLocks): PortInfo[] {
    return device.ports.map((port) => {
      const access = locks.port(port.id)
      const visible = access !== 'hidden'
      return {
        id: port.id,
        medium: port.medium,
        role: port.role,
        ...DeviceInfoModel.portStatus(state, device, port.id),
        access,
        adminUp: visible ? port.adminUp : null,
        settings: visible ? DeviceInfoModel.settingsOf(port) : null,
      }
    })
  }

  static settingsOf(port: Port): PortSettingsSummary {
    switch (port.role) {
      case 'switched': {
        const { mode, accessVlan, nativeVlan, allowedVlans } = port.l2
        if (mode === 'access') return { kind: 'access', vlan: accessVlan }
        return { kind: 'trunk', nativeVlan, allowed: allowedVlans === 'all' ? 'all' : VlanListParser.format(allowedVlans) }
      }
      case 'routed':
        return {
          kind: 'l3',
          ipv4: port.l3.ipv4,
          subInterfaces: port.subInterfaces.map((sub) => ({ id: sub.id, vlan: sub.vlan, ipv4: sub.l3.ipv4 })),
        }
      case 'host':
        return { kind: 'l3', ipv4: port.l3.ipv4, subInterfaces: [] }
      default:
        return { kind: 'none' }
    }
  }

  /** Connected networks of interfaces that are up, then every configured static route. */
  static routes(state: NetworkStateV2, device: DeviceV2): RouteInfo[] {
    const topology = TopologyV2.of(state)
    const connected = L3Interfaces.of(device).flatMap((iface): RouteInfo[] => {
      if (!L3Interfaces.isNetworkSide(iface) || !L3Interfaces.isAddressed(iface) || !RoutingTableV2.isUp(topology, iface)) return []
      const network = Ipv4.network(iface.address, iface.mask)
      const prefixLength = Ipv4.prefixLength(iface.mask)
      if (network === null || prefixLength === null) return []
      return [{ type: 'connected', network: Ipv4.format(network), prefixLength, interfaceId: iface.id, adminDistance: 0 }]
    })
    const statics = (device.routing?.staticRoutes ?? []).map((route): RouteInfo => ({
      type: 'static',
      network: route.prefix,
      prefixLength: Ipv4.prefixLength(route.mask) ?? 0,
      ...(route.nextHop !== undefined ? { nextHop: route.nextHop } : {}),
      ...(route.exitInterfaceId !== undefined ? { interfaceId: route.exitInterfaceId } : {}),
      adminDistance: route.adminDistance,
    }))
    return [...connected, ...statics]
  }
}
