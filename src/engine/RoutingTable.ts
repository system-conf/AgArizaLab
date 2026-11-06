import type { Device, StaticRoute } from '../domain'
import { Ipv4 } from './Ipv4'
import { InterfaceStatus } from '../net/InterfaceStatus'
import { type L3Interface, L3Interfaces } from './L3Interfaces'
import type { Topology } from './Topology'

/** A usable route: where a packet for a matching destination leaves the router. */
export interface Route {
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
export class RoutingTable {
  static lookup(topology: Topology, device: Device, ip: string): Route | null {
    return RoutingTable.lookupAt(topology, device, ip, 0)
  }

  /** Is the interface operational: powered device, admin up, port link up (SVI: VLAN active)? */
  static isUp(topology: Topology, iface: L3Interface): boolean {
    return InterfaceStatus.isUp(topology, iface)
  }

  /** Addresses of the device's up interfaces. */
  static ownsAddress(topology: Topology, device: Device, ip: string): L3Interface | undefined {
    return L3Interfaces.of(device).find((iface) => iface.address === ip && RoutingTable.isUp(topology, iface))
  }

  private static lookupAt(topology: Topology, device: Device, ip: string, depth: number): Route | null {
    let best: Route | null = null
    for (const route of RoutingTable.candidates(topology, device, ip, depth)) {
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

  private static candidates(topology: Topology, device: Device, ip: string, depth: number): Route[] {
    const routes: Route[] = []
    for (const iface of L3Interfaces.of(device)) {
      if (!L3Interfaces.isAddressed(iface) || !Ipv4.sameSubnet(iface.address, ip, iface.mask)) continue
      if (!RoutingTable.isUp(topology, iface)) continue
      routes.push({ prefixLength: Ipv4.prefixLength(iface.mask) ?? 0, adminDistance: CONNECTED_DISTANCE, exit: iface, nextHop: null })
    }
    for (const route of device.routing?.staticRoutes ?? []) {
      if (!Ipv4.inNetwork(ip, route.prefix, route.mask)) continue
      const usable = RoutingTable.resolveStatic(topology, device, route, depth)
      if (usable) routes.push(usable)
    }
    return routes
  }

  private static resolveStatic(topology: Topology, device: Device, route: StaticRoute, depth: number): Route | null {
    const prefixLength = Ipv4.prefixLength(route.mask)
    if (prefixLength === null) return null
    const base = { prefixLength, adminDistance: route.adminDistance }
    if (route.exitInterfaceId !== undefined) {
      const exit = L3Interfaces.find(device, route.exitInterfaceId)
      if (!exit || !RoutingTable.isUp(topology, exit)) return null
      return { ...base, exit, nextHop: route.nextHop ?? null }
    }
    if (route.nextHop === undefined || !Ipv4.isValid(route.nextHop) || depth >= MAX_RECURSION) return null
    const via = RoutingTable.lookupAt(topology, device, route.nextHop, depth + 1)
    if (!via) return null
    return { ...base, exit: via.exit, nextHop: via.nextHop ?? route.nextHop }
  }
}
