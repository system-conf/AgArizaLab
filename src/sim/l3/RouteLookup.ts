import { Ipv4 } from '../../engine/Ipv4'
import type { RouteEntry } from '../contract'

/** Where a packet for one destination leaves: the chosen entry, its exit interface and the address to ARP for. */
export interface ResolvedRoute {
  readonly entry: RouteEntry
  readonly exitInterfaceId: string
  /** The destination itself for connected / exit-interface routes, else the (recursively resolved) next hop. */
  readonly nextHopIp: string
}

const MAX_RECURSION = 4

/** Forwarding decisions over a built routing table (runtime.network.routes). */
export class RouteLookup {
  /** Longest prefix, then lowest administrative distance, then table order; `local` and unresolved entries never forward. */
  static best(routes: readonly RouteEntry[], ip: string): RouteEntry | null {
    let best: RouteEntry | null = null
    for (const route of routes) {
      if (route.code === 'local' || route.exitInterfaceId === null || !Ipv4.inNetwork(ip, route.prefix, route.mask)) continue
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

  static resolve(routes: readonly RouteEntry[], ip: string): ResolvedRoute | null {
    return RouteLookup.resolveAt(routes, ip, 0)
  }

  private static resolveAt(routes: readonly RouteEntry[], ip: string, depth: number): ResolvedRoute | null {
    const entry = RouteLookup.best(routes, ip)
    if (!entry || entry.exitInterfaceId === null) return null
    const exitInterfaceId = entry.exitInterfaceId
    if (entry.nextHop === null) return { entry, exitInterfaceId, nextHopIp: ip }
    const nextHop = entry.nextHop
    const onLink = routes.some(
      (route) => route.code === 'connected' && route.exitInterfaceId === exitInterfaceId && Ipv4.inNetwork(nextHop, route.prefix, route.mask),
    )
    if (onLink || depth >= MAX_RECURSION) return { entry, exitInterfaceId, nextHopIp: nextHop }
    // A next hop behind another next hop (recursive static route): ARP for the closest one.
    const via = RouteLookup.resolveAt(routes, nextHop, depth + 1)
    return { entry, exitInterfaceId, nextHopIp: via?.nextHopIp ?? nextHop }
  }
}
