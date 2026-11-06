// Static routes (`ip route <prefix> <mask> {<next hop> | <interface> [<next hop>]} [<distance>]`)
// and the `ip routing` switch of an L3 switch.
import type { Device, RoutingSettings, StaticRoute } from '../../../domain'
import { L3Interfaces } from '../../../engine'
import { localizedMessage } from '../../../i18n/messageKeys'
import { newRowKey, parseWholeNumber, type FieldErrors } from './formTypes'
import { Ipv4Fields } from './Ipv4Fields'

export interface StaticRouteDraft {
  key: string
  prefix: string
  mask: string
  nextHop: string
  /** '' = none. */
  exitInterfaceId: string
  adminDistance: string
}

export interface RoutingDraft {
  ipRouting: boolean
  routes: StaticRouteDraft[]
}

export type StaticRouteField = 'prefix' | 'mask' | 'nextHop' | 'exitInterfaceId' | 'adminDistance'

export const DEFAULT_STATIC_DISTANCE = 1

export class StaticRouteFormModel {
  static toDraft(routing: RoutingSettings): RoutingDraft {
    return {
      ipRouting: routing.ipRouting,
      routes: routing.staticRoutes.map((route, index) => ({
        key: `route${index}`,
        prefix: route.prefix,
        mask: route.mask,
        nextHop: route.nextHop ?? '',
        exitInterfaceId: route.exitInterfaceId ?? '',
        adminDistance: String(route.adminDistance),
      })),
    }
  }

  static newDraft(): StaticRouteDraft {
    return { key: newRowKey(), prefix: '', mask: '', nextHop: '', exitInterfaceId: '', adminDistance: String(DEFAULT_STATIC_DISTANCE) }
  }

  /** Interfaces a route can leave through: routed ports, sub-interfaces and SVIs (not NICs). */
  static exitInterfaces(device: Device): string[] {
    return L3Interfaces.of(device)
      .filter((iface) => L3Interfaces.isNetworkSide(iface))
      .map((iface) => iface.id)
  }

  /** `interfaceIds`: what `exitInterfaces` returns for the saved device. */
  static validate(rows: readonly StaticRouteDraft[], interfaceIds: readonly string[]): FieldErrors<StaticRouteField>[] {
    const seen = new Set<string>()
    return rows.map((row) => {
      const errors: FieldErrors<StaticRouteField> = {}
      const prefixError = Ipv4Fields.address(row.prefix, true)
      const maskError = Ipv4Fields.mask(row.mask, true, true)
      if (prefixError) errors.prefix = prefixError
      if (maskError) errors.mask = maskError
      if (!prefixError && !maskError) {
        const networkError = Ipv4Fields.networkAddress(row.prefix, row.mask)
        if (networkError) errors.prefix = networkError
      }
      const nextHop = row.nextHop.trim()
      const exit = row.exitInterfaceId
      if (nextHop === '' && exit === '') errors.nextHop = localizedMessage('deviceConfig:errors.nextHopOrExit')
      const nextHopError = Ipv4Fields.address(nextHop, false)
      if (nextHopError) errors.nextHop = nextHopError
      if (exit !== '' && !interfaceIds.includes(exit)) errors.exitInterfaceId = localizedMessage('deviceConfig:errors.unknownInterface', { id: exit })
      if (parseWholeNumber(row.adminDistance, 1, 255) === null) errors.adminDistance = localizedMessage('deviceConfig:errors.adminDistance')
      const signature = [row.prefix.trim(), row.mask.trim(), nextHop, exit].join('|')
      if (seen.has(signature) && Object.keys(errors).length === 0) errors.prefix = localizedMessage('deviceConfig:errors.duplicateRoute')
      seen.add(signature)
      return errors
    })
  }

  /** Call after `validate`. */
  static apply(draft: RoutingDraft, routing: RoutingSettings): RoutingSettings {
    return { ...routing, ipRouting: draft.ipRouting, staticRoutes: draft.routes.map((row) => StaticRouteFormModel.routeOf(row)) }
  }

  private static routeOf(row: StaticRouteDraft): StaticRoute {
    const base = {
      prefix: row.prefix.trim(),
      mask: row.mask.trim(),
      adminDistance: parseWholeNumber(row.adminDistance, 1, 255) ?? DEFAULT_STATIC_DISTANCE,
    }
    const nextHop = row.nextHop.trim()
    if (nextHop === '') return { ...base, exitInterfaceId: row.exitInterfaceId }
    return { ...base, nextHop, ...(row.exitInterfaceId !== '' ? { exitInterfaceId: row.exitInterfaceId } : {}) }
  }
}
