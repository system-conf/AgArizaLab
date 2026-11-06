import { describe, expect, it } from 'vitest'
import { editDevice, editLink, labDevice } from '../../engine/testLabs'
import { Topology } from '../../engine/Topology'
import type { NetworkState } from '../../domain'
import type { RouteEntry } from '../contract'
import { l3Engine } from './l3TestLayers'
import { l3SwitchLab, staticRoute, stickLab, twoRouterLab } from './l3TestLabs'
import { RouteLookup } from './RouteLookup'
import { RouteTableBuilder } from './RouteTableBuilder'

const MASK = '255.255.255.0'

function routesOf(state: NetworkState, deviceId: string): RouteEntry[] {
  return RouteTableBuilder.build(Topology.of(state), labDevice(state, deviceId))
}

function brief(routes: readonly RouteEntry[]): string[] {
  return routes.map((route) => `${route.code} ${route.prefix}/${route.prefixLength} [${route.adminDistance}] ${route.nextHop ?? '-'} ${route.exitInterfaceId ?? 'none'}`)
}

describe('RouteTableBuilder', () => {
  it('lists connected and local routes of up interfaces, then static routes in configuration order', () => {
    const lab = twoRouterLab({
      r1: [
        staticRoute('10.0.2.0', MASK, '10.0.12.2'),
        // Recursive: 172.16.0.0/16 via 10.0.2.5, which is reached through the static route above.
        staticRoute('172.16.0.0', '255.255.0.0', '10.0.2.5'),
        // Next hop nobody routes to: listed without an exit interface (not installed).
        staticRoute('192.168.99.0', MASK, '192.168.50.1'),
        { prefix: '10.9.0.0', mask: '255.255.0.0', exitInterfaceId: 'Gi0/7', adminDistance: 1 },
      ],
    })
    expect(brief(routesOf(lab, 'r1'))).toEqual([
      'connected 10.0.1.0/24 [0] - Gi0/0',
      'local 10.0.1.1/32 [0] - Gi0/0',
      'connected 10.0.12.0/24 [0] - Gi0/1',
      'local 10.0.12.1/32 [0] - Gi0/1',
      'static 10.0.2.0/24 [1] 10.0.12.2 Gi0/1',
      'static 172.16.0.0/16 [1] 10.0.2.5 Gi0/1',
      'static 192.168.99.0/24 [1] 192.168.50.1 none',
    ])
  })

  it('drops the routes of an interface whose link is down (and static routes that relied on it)', () => {
    const lab = editLink(twoRouterLab(), 'l3', (link) => ({ ...link, connected: false }))
    expect(brief(routesOf(lab, 'r1'))).toEqual([
      'connected 10.0.1.0/24 [0] - Gi0/0',
      'local 10.0.1.1/32 [0] - Gi0/0',
      'static 10.0.2.0/24 [1] 10.0.12.2 none',
    ])
  })

  it('gives hosts their connected network and a default route via an on-link gateway only', () => {
    const lab = twoRouterLab()
    expect(brief(routesOf(lab, 'pc1'))).toEqual([
      'connected 10.0.1.0/24 [0] - eth0',
      'local 10.0.1.10/32 [0] - eth0',
      'static 0.0.0.0/0 [1] 10.0.1.1 eth0',
    ])
    const offLink = editDevice(lab, 'pc1', (device) => ({ ...device, host: { defaultGateway: '10.0.9.1', dnsServers: [], appLinks: [] } }))
    expect(brief(routesOf(offLink, 'pc1'))).toEqual(['connected 10.0.1.0/24 [0] - eth0', 'local 10.0.1.10/32 [0] - eth0'])
  })

  it('routes between sub-interfaces (router-on-a-stick) and SVIs (L3 switch)', () => {
    expect(brief(routesOf(stickLab(), 'router')).filter((line) => line.startsWith('connected'))).toEqual([
      'connected 192.168.10.0/24 [0] - Gi0/0.10',
      'connected 192.168.20.0/24 [0] - Gi0/0.20',
    ])
    expect(brief(routesOf(l3SwitchLab(), 'core')).filter((line) => line.startsWith('connected'))).toEqual([
      'connected 192.168.10.0/24 [0] - Vlan10',
      'connected 192.168.20.0/24 [0] - Vlan20',
    ])
  })

  it('is built on start and rebuilt when the configuration changes', () => {
    const { engine } = l3Engine(twoRouterLab())
    expect(engine.runtime('r1')?.network.routes).toHaveLength(5)
    engine.reconfigure(editLink(engine.network(), 'l3', (link) => ({ ...link, connected: false })))
    expect(brief(engine.runtime('r1')?.network.routes ?? [])).toContain('static 10.0.2.0/24 [1] 10.0.12.2 none')
    expect(engine.runtime('sw1')?.network.routes).toEqual([])
  })
})

describe('RouteLookup', () => {
  const route = (prefix: string, prefixLength: number, mask: string, adminDistance: number, nextHop: string | null, exit: string | null): RouteEntry => ({
    code: nextHop === null && adminDistance === 0 ? 'connected' : 'static',
    prefix,
    mask,
    prefixLength,
    adminDistance,
    metric: 0,
    nextHop,
    exitInterfaceId: exit,
  })
  const table: RouteEntry[] = [
    route('10.0.12.0', 24, MASK, 0, null, 'Gi0/1'),
    { ...route('10.0.12.1', 32, '255.255.255.255', 0, null, 'Gi0/1'), code: 'local' },
    route('0.0.0.0', 0, '0.0.0.0', 1, '10.0.12.2', 'Gi0/1'),
    route('10.0.0.0', 8, '255.0.0.0', 5, '10.0.12.3', 'Gi0/1'),
    route('10.0.0.0', 8, '255.0.0.0', 1, '10.0.12.4', 'Gi0/1'),
    route('10.0.2.0', 24, MASK, 1, '10.0.12.5', 'Gi0/1'),
    route('172.16.0.0', 16, '255.255.0.0', 1, '10.0.2.7', 'Gi0/1'),
    route('192.168.0.0', 16, '255.255.0.0', 1, '192.168.50.1', null),
  ]

  it('chooses the longest prefix, then the lowest administrative distance', () => {
    expect(RouteLookup.best(table, '10.0.2.5')?.nextHop).toBe('10.0.12.5')
    expect(RouteLookup.best(table, '10.7.7.7')?.nextHop).toBe('10.0.12.4')
    expect(RouteLookup.best(table, '8.8.8.8')?.nextHop).toBe('10.0.12.2')
  })

  it('never forwards with local routes or entries that did not resolve', () => {
    expect(RouteLookup.best(table, '10.0.12.1')?.code).toBe('connected')
    expect(RouteLookup.best(table, '192.168.1.1')?.prefixLength).toBe(0)
    expect(RouteLookup.best(table.slice(0, 2), '8.8.8.8')).toBeNull()
  })

  it('ARPs for the destination on connected routes and resolves recursive next hops', () => {
    expect(RouteLookup.resolve(table, '10.0.12.9')).toMatchObject({ exitInterfaceId: 'Gi0/1', nextHopIp: '10.0.12.9' })
    expect(RouteLookup.resolve(table, '10.0.2.5')?.nextHopIp).toBe('10.0.12.5')
    expect(RouteLookup.resolve(table, '172.16.1.1')?.nextHopIp).toBe('10.0.12.5')
  })
})
