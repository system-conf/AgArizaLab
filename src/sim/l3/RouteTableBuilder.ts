import type { Device, StaticRoute } from '../../domain'
import { HostAttachment } from '../../engine/HostAttachment'
import { Ipv4 } from '../../engine/Ipv4'
import { type L3Interface, L3Interfaces } from '../../engine/L3Interfaces'
import { RoutingTable } from '../../engine/RoutingTable'
import type { Topology } from '../../engine/Topology'
import { DeviceProfiles, type RouteEntry } from '../contract'
import { InterfaceAddresses } from './InterfaceAddresses'

const CONNECTED_DISTANCE = 0
const HOST_ROUTE_MASK = '255.255.255.255'
/** Administrative distance of a host's default gateway route (a static route in IOS terms). */
const GATEWAY_DISTANCE = 1
/** Recursive next-hop lookups deeper than this do not resolve (IOS gives up too; engine parity). */
const MAX_RECURSION = 4

/** A route candidate while resolving a static next hop. */
interface Candidate {
  readonly prefixLength: number
  readonly adminDistance: number
  readonly exit: L3Interface
}

/**
 * Builds a device's routing table from its configuration (docs/SIMULATION.md §4, MODEL_V2 §13):
 * per up interface its connected subnet and `local` /32, then the static routes in configuration order
 * (exit interface up, or next hop resolving recursively; unresolved ones are listed with a null exit),
 * and for hosts a default route via the on-link gateway. Table order breaks ties in RouteLookup.
 */
export class RouteTableBuilder {
  static build(topology: Topology, device: Device): RouteEntry[] {
    const role = DeviceProfiles.of(device).ipRole
    if (role === 'none') return []
    const up = InterfaceAddresses.upAddressed(topology, device)
    const routes: RouteEntry[] = up.flatMap((iface) => RouteTableBuilder.connected(iface))
    if (role === 'router') {
      for (const route of device.routing?.staticRoutes ?? []) {
        const entry = RouteTableBuilder.staticEntry(topology, device, route)
        if (entry) routes.push(entry)
      }
    } else {
      const gatewayRoute = RouteTableBuilder.gatewayRoute(device, up)
      if (gatewayRoute) routes.push(gatewayRoute)
    }
    return routes
  }

  private static connected(iface: L3Interface): RouteEntry[] {
    const network = Ipv4.network(iface.address, iface.mask)
    const prefixLength = Ipv4.prefixLength(iface.mask)
    if (network === null || prefixLength === null) return []
    const base = { adminDistance: CONNECTED_DISTANCE, metric: 0, nextHop: null, exitInterfaceId: iface.id }
    return [
      { ...base, code: 'connected', prefix: Ipv4.format(network), mask: iface.mask, prefixLength },
      { ...base, code: 'local', prefix: iface.address, mask: HOST_ROUTE_MASK, prefixLength: 32 },
    ]
  }

  /** null = not in the table (invalid mask, exit interface missing or down). */
  private static staticEntry(topology: Topology, device: Device, route: StaticRoute): RouteEntry | null {
    const prefixLength = Ipv4.prefixLength(route.mask)
    if (prefixLength === null || !Ipv4.isValid(route.prefix)) return null
    const network = Ipv4.network(route.prefix, route.mask)
    const base = {
      code: 'static' as const,
      prefix: network === null ? route.prefix : Ipv4.format(network),
      mask: route.mask,
      prefixLength,
      adminDistance: route.adminDistance,
      metric: 0,
      nextHop: route.nextHop ?? null,
    }
    const exit = RouteTableBuilder.resolveExit(topology, device, route, 0)
    if (exit) return { ...base, exitInterfaceId: exit.id }
    return route.exitInterfaceId === undefined ? { ...base, exitInterfaceId: null } : null
  }

  /** Exit interface of a static route: the configured one when up, else the route to its next hop. */
  private static resolveExit(topology: Topology, device: Device, route: StaticRoute, depth: number): L3Interface | null {
    if (route.exitInterfaceId !== undefined) {
      const exit = L3Interfaces.find(device, route.exitInterfaceId)
      return exit && RoutingTable.isUp(topology, exit) ? exit : null
    }
    if (route.nextHop === undefined || !Ipv4.isValid(route.nextHop) || depth >= MAX_RECURSION) return null
    return RouteTableBuilder.bestExit(topology, device, route.nextHop, depth + 1)
  }

  /** Longest prefix, then lowest distance, then order (connected first): the rule engine's selection. */
  private static bestExit(topology: Topology, device: Device, ip: string, depth: number): L3Interface | null {
    let best: Candidate | null = null
    for (const candidate of RouteTableBuilder.candidates(topology, device, ip, depth)) {
      if (
        best === null ||
        candidate.prefixLength > best.prefixLength ||
        (candidate.prefixLength === best.prefixLength && candidate.adminDistance < best.adminDistance)
      ) {
        best = candidate
      }
    }
    return best?.exit ?? null
  }

  private static candidates(topology: Topology, device: Device, ip: string, depth: number): Candidate[] {
    const list: Candidate[] = []
    for (const iface of InterfaceAddresses.upAddressed(topology, device)) {
      if (!Ipv4.sameSubnet(iface.address, ip, iface.mask)) continue
      list.push({ prefixLength: Ipv4.prefixLength(iface.mask) ?? 0, adminDistance: CONNECTED_DISTANCE, exit: iface })
    }
    for (const route of device.routing?.staticRoutes ?? []) {
      const prefixLength = Ipv4.prefixLength(route.mask)
      if (prefixLength === null || !Ipv4.inNetwork(ip, route.prefix, route.mask)) continue
      const exit = RouteTableBuilder.resolveExit(topology, device, route, depth)
      if (exit) list.push({ prefixLength, adminDistance: route.adminDistance, exit })
    }
    return list
  }

  /** Hosts (and switches with a management SVI): 0.0.0.0/0 via the gateway when it is on-link. */
  private static gatewayRoute(device: Device, up: readonly L3Interface[]): RouteEntry | null {
    const { gateway } = HostAttachment.interfaces(device)
    if (!Ipv4.isValid(gateway)) return null
    const exit = up.find((iface) => Ipv4.sameSubnet(iface.address, gateway, iface.mask))
    if (!exit) return null
    return {
      code: 'static',
      prefix: '0.0.0.0',
      mask: '0.0.0.0',
      prefixLength: 0,
      adminDistance: GATEWAY_DISTANCE,
      metric: 0,
      nextHop: gateway,
      exitInterfaceId: exit.id,
    }
  }
}
