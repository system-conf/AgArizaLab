import { describe, expect, it } from 'vitest'
import type { Device, NetworkState, Port } from '../../domain'
import { DefaultNetworkEngine } from '../../engine/DefaultNetworkEngine'
import { DhcpService } from '../../engine/DhcpService'
import { SegmentFinder } from '../../engine/SegmentFinder'
import { labDevice, labHost, labLink, labRouter } from '../../engine/testLabs'
import type { StateEffect } from '../contract'
import { SimulationKernel } from '../core/SimulationKernel'
import { serviceLayer } from './index'
import { pool, withDhcp } from './testServiceLabs'
import { serviceTestLayers } from './testServiceStack'

const engine = new DefaultNetworkEngine()
const engineDhcp = new DhcpService(new SegmentFinder())
const RANGE = (base: string) => ({ start: `${base}.100`, end: `${base}.200` })

/** Router r (Gi0/0 192.168.1.1, Gi0/1 192.168.2.1, a pool each); host `multi` with eth0 / eth1 on them. */
function twoNicLab(eth0Static?: { gateway: string; dns: string[] }): NetworkState {
  const base = labHost('multi', eth0Static ? '192.168.1.20' : '', eth0Static ? { gateway: eth0Static.gateway, dns: eth0Static.dns } : { addressing: 'dhcp' })
  const eth1: Port = { id: 'eth1', medium: 'copper', role: 'host', adminUp: true, mac: '02:00:00:EE:10:01', l3: { ipv4: { addressing: 'dhcp', address: '', mask: '' } } }
  const router = withDhcp(labRouter('r', [{ id: 'Gi0/0', ip: '192.168.1.1' }, { id: 'Gi0/1', ip: '192.168.2.1' }]), [
    pool('p1', '192.168.1', { range: RANGE('192.168.1') }),
    pool('p2', '192.168.2', { range: RANGE('192.168.2') }),
  ])
  return {
    devices: [router, { ...base, ports: [...base.ports, eth1] }],
    links: [
      labLink('l0', ['multi', 'eth0'], ['r', 'Gi0/0'], { cable: 'copperCross' }),
      labLink('l1', ['multi', 'eth1'], ['r', 'Gi0/1'], { cable: 'copperCross' }),
    ],
  }
}

function simulate(state: NetworkState, kind: 'dhcpRenew' | 'dhcpRelease', portId?: string): NetworkState {
  const kernel = SimulationKernel.create(state, serviceTestLayers)
  const id = kernel.inject({ kind, deviceId: 'multi', ...(portId === undefined ? {} : { portId }) })
  kernel.runUntilDone(id)
  return kernel.network()
}

function engineRenew(state: NetworkState, portId?: string): NetworkState {
  const result = engine.renewDhcp(state, 'multi', portId)
  if (!result.ok) throw new Error(`engine renew failed: ${result.reason}`)
  return result.nextState
}

function engineRelease(state: NetworkState, portId?: string): NetworkState {
  const result = engineDhcp.release(state, 'multi', portId)
  if (!result.ok) throw new Error(`engine release failed: ${result.reason}`)
  return result.nextState
}

/** What DHCP may change: the client device and the server's pools. */
function dhcpView(state: NetworkState): { multi: Device; pools: unknown } {
  return { multi: labDevice(state, 'multi'), pools: labDevice(state, 'r').services?.dhcp?.pools }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

describe('DHCP effects: the rule engine\'s DhcpService rules', () => {
  it('keeps the gateway and DNS of a static NIC (and fills them when it left them empty)', () => {
    const keeps = simulate(twoNicLab({ gateway: '192.168.1.254', dns: ['8.8.8.8'] }), 'dhcpRenew')
    expect(labDevice(keeps, 'multi').host).toMatchObject({ defaultGateway: '192.168.1.254', dnsServers: ['8.8.8.8'] })
    const fills = simulate(twoNicLab({ gateway: '', dns: [] }), 'dhcpRenew')
    expect(labDevice(fills, 'multi').host).toMatchObject({ defaultGateway: '192.168.2.1', dnsServers: ['192.168.2.1'] })
  })

  it('matches the engine for renew and release on every NIC combination', () => {
    const cases: Array<[string, NetworkState, NetworkState]> = []
    for (const lab of [twoNicLab(), twoNicLab({ gateway: '192.168.1.254', dns: ['8.8.8.8'] }), twoNicLab({ gateway: '', dns: [] })]) {
      cases.push(['renew all', simulate(lab, 'dhcpRenew'), engineRenew(lab)])
      cases.push(['renew eth1', simulate(lab, 'dhcpRenew', 'eth1'), engineRenew(lab, 'eth1')])
      const renewed = engineRenew(lab)
      cases.push(['release all', simulate(renewed, 'dhcpRelease'), engineRelease(renewed)])
      cases.push(['release eth1', simulate(renewed, 'dhcpRelease', 'eth1'), engineRelease(renewed, 'eth1')])
    }
    const both = engineRenew(twoNicLab())
    cases.push(['renew eth0 again', simulate(both, 'dhcpRenew', 'eth0'), engineRenew(both, 'eth0')])
    for (const [label, simulated, expected] of cases) expect(dhcpView(simulated), label).toEqual(dhcpView(expected))
  })

  it('is pure: the input stays untouched and unrelated devices are shared', () => {
    const state = deepFreeze(twoNicLab())
    const mac = labDevice(state, 'multi').ports[0]?.mac ?? ''
    const bound: StateEffect = {
      kind: 'dhcpLeaseBound',
      clientId: 'multi',
      portId: 'eth0',
      mac,
      ip: '192.168.1.100',
      mask: '255.255.255.0',
      gateway: '192.168.1.1',
      dnsServers: ['192.168.1.1'],
      serverId: 'r',
      poolId: 'p1',
    }
    const before = JSON.stringify(state)
    const next = serviceLayer.applyEffect(state, bound)
    expect(JSON.stringify(state)).toBe(before)
    expect(next).not.toBe(state)
    expect(labDevice(next, 'r').services?.dhcp?.pools[1]).toBe(labDevice(state, 'r').services?.dhcp?.pools[1])
    expect(next.links).toBe(state.links)
    // Idempotent: the session applies the same effects to the lab document.
    expect(serviceLayer.applyEffect(next, bound)).toEqual(next)
    const released = serviceLayer.applyEffect(next, { kind: 'dhcpLeaseReleased', clientId: 'multi', portId: 'eth0' })
    expect(labDevice(released, 'r').services?.dhcp?.pools[0]?.leases).toEqual([{ mac, ip: '192.168.1.100' }])
    expect(serviceLayer.applyEffect(state, { kind: 'dhcpLeaseReleased', clientId: 'ghost', portId: 'eth0' })).toBe(state)
  })
})
