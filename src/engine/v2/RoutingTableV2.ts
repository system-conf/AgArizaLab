import type { DeviceV2, StaticRoute } from '../../domain/v2'
import { Ipv4 } from '../Ipv4'
import { type L3Interface, L3Interfaces } from './L3Interfaces'
import { VlanRules } from './VlanRules'
import type { TopologyV2 } from './TopologyV2'

/** A usable route: where a packet for a matching destination leaves the router. */
export interface RouteV2 {
  prefixLength: number
  adminDistance: number
  exit: L3Interface
  /** Next router to hand the packet to; null = the destination is on the exit interface's link. */
  nextHop: string | null
}

const CONNECTED_DISTANCE = 0
/** Recursive next-hop lookups deeper than this are treated as unresolvable (IOS gives up too). */
const MAX_RECURSION = 4

/**
 * Routing table of a v2 device (MODEL_V2 §13): connected subnets of up interfaces plus static
 * routes whose exit interface is up or whose next hop resolves. Longest prefix wins, then the
 * lowest administrative distance, then table order (connected first, then static order).
 */
export class RoutingTableV2 {
  static lookup(topology: TopologyV2, device: DeviceV2, ip: string): RouteV2 | null {
    return RoutingTableV2.lookupAt(topology, device, ip, 0)
  }

  /** Is the interface operational: powered device, admin up, port link up (SVI: VLAN active)? */
  static isUp(topology: TopologyV2, iface: L3Interface): boolean {
    const device = topology.find(iface.deviceId)
    if (!device?.powered || !iface.adminUp) return false
    if (iface.kind === 'svi') return VlanRules.inDatabase(device, iface.vlan ?? 0)
    const port = device.ports.find((candidate) => candidate.id === iface.portId)
    if (!port?.adminUp || iface.portId === undefined) return false
    return topology.linksAt(device.id, iface.portId).some((link) => topology.isUp(link))
  }

  /** Addresses of the device's up interfaces. */
  static ownsAddress(topology: TopologyV2, device: DeviceV2, ip: string): L3Interface | undefined {
    return L3Interfaces.of(device).find((iface) => iface.address === ip && RoutingTableV2.isUp(topology, iface))
  }

  private static lookupAt(topology: TopologyV2, device: DeviceV2, ip: string, depth: number): RouteV2 | null {
    let best: RouteV2 | null = null
    for (const route of RoutingTableV2.candidates(topology, device, ip, depth)) {
      if (
        best === null ||
        route.prefixLength > best.prefixLength ||
        (route.prefixLength === best.prefixLength && route.adminDistance < best.adminDistance)
      ) {
        best = route
      }
    }
    return best
  }

  private static candidates(topology: TopologyV2, device: DeviceV2, ip: string, depth: number): RouteV2[] {
    const routes: RouteV2[] = []
    for (const iface of L3Interfaces.of(device)) {
      if (!L3Interfaces.isAddressed(iface) || !Ipv4.sameSubnet(iface.address, ip, iface.mask)) continue
      if (!RoutingTableV2.isUp(topology, iface)) continue
      routes.push({ prefixLength: Ipv4.prefixLength(iface.mask) ?? 0, adminDistance: CONNECTED_DISTANCE, exit: iface, nextHop: null })
    }
    for (const route of device.routing?.staticRoutes ?? []) {
      if (!Ipv4.inNetwork(ip, route.prefix, route.mask)) continue
      const usable = RoutingTableV2.resolveStatic(topology, device, route, depth)
      if (usable) routes.push(usable)
    }
    return routes
  }

  private static resolveStatic(topology: TopologyV2, device: DeviceV2, route: StaticRoute, depth: number): RouteV2 | null {
    const prefixLength = Ipv4.prefixLength(route.mask)
    if (prefixLength === null) return null
    const base = { prefixLength, adminDistance: route.adminDistance }
    if (route.exitInterfaceId !== undefined) {
      const exit = L3Interfaces.find(device, route.exitInterfaceId)
      if (!exit || !RoutingTableV2.isUp(topology, exit)) return null
      return { ...base, exit, nextHop: route.nextHop ?? null }
    }
    if (route.nextHop === undefined || !Ipv4.isValid(route.nextHop) || depth >= MAX_RECURSION) return null
    const via = RoutingTableV2.lookupAt(topology, device, route.nextHop, depth + 1)
    if (!via) return null
    return { ...base, exit: via.exit, nextHop: via.nextHop ?? route.nextHop }
  }
}
