import { describe, expect, it } from 'vitest'
import type { NetworkState, Port } from '../domain'
import { DefaultNetworkEngine } from './DefaultNetworkEngine'
import { DhcpService } from './DhcpService'
import { SegmentFinder } from './SegmentFinder'
import { accessMode, editDevice, labDevice, labHost, labLink, labRouter } from './testLabs'
import { editNic, editRouterServices, officeLab, officePool, shutPort, vlanLab } from './testNetworks'

const engine = new DefaultNetworkEngine()
// Release is not part of the engine contract (only `ipconfig /release` uses it).
const dhcp = new DhcpService(new SegmentFinder())

function withNewDhcpHost(state: NetworkState, portId: string): NetworkState {
  return {
    devices: [...state.devices, labHost('laptop', '', { addressing: 'dhcp' })],
    links: [...state.links, labLink('laptopLink', ['laptop', 'eth0'], ['switch', portId])],
  }
}

/** One more access port on the switch; its VLAN joins the VLAN database (as the v1 migration does for a used VLAN). */
function withExtraPort(state: NetworkState, portId: string, vlan: number): NetworkState {
  return editDevice(state, 'switch', (device) => {
    const switching = device.switching
    if (!switching) throw new Error('switch has no switching settings')
    const known = switching.vlans.some((entry) => entry.id === vlan)
    const vlans = known ? switching.vlans : [...switching.vlans, { id: vlan, name: `VLAN${vlan}` }]
    const port: Port = { id: portId, medium: 'copper', role: 'switched', adminUp: true, mac: '02:00:00:EE:00:01', l2: accessMode(vlan) }
    return { ...device, ports: [...device.ports, port], switching: { ...switching, vlans } }
  })
}

function nicOf(state: NetworkState, deviceId: string) {
  const port = labDevice(state, deviceId).ports[0]
  return port?.role === 'host' ? port.l3.ipv4 : undefined
}

function poolsOf(state: NetworkState) {
  return labDevice(state, 'router').services?.dhcp?.pools
}

describe('DhcpService', () => {
  it('reuses the existing lease for the MAC', () => {
    const result = engine.renewDhcp(officeLab(), 'pc2')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ip).toBe('192.168.1.101')
    expect(poolsOf(result.nextState)?.[0]?.leases).toHaveLength(1)
  })

  it('hands out the first free address and records a new lease', () => {
    const state = withNewDhcpHost(withExtraPort(officeLab(), 'Fa0/5', 1), 'Fa0/5')
    const result = engine.renewDhcp(state, 'laptop')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ip).toBe('192.168.1.100')
    expect(nicOf(result.nextState, 'laptop')).toEqual({ addressing: 'dhcp', address: '192.168.1.100', mask: '255.255.255.0' })
    expect(labDevice(result.nextState, 'laptop').host).toEqual({ defaultGateway: '192.168.1.1', dnsServers: ['192.168.1.1'], appLinks: [] })
    const leases = poolsOf(result.nextState)?.[0]?.leases ?? []
    expect(leases.map((lease) => lease.ip)).toEqual(['192.168.1.101', '192.168.1.100'])
  })

  it('skips addresses used by static devices', () => {
    const base = withNewDhcpHost(withExtraPort(officeLab(), 'Fa0/5', 1), 'Fa0/5')
    const state = editNic(base, 'printer', { address: '192.168.1.100' })
    const result = engine.renewDhcp(state, 'laptop')
    expect(result.ok && result.ip).toBe('192.168.1.102')
  })

  it('serves the pool of the host VLAN', () => {
    const state = withNewDhcpHost(withExtraPort(vlanLab(), 'Fa0/6', 10), 'Fa0/6')
    const result = engine.renewDhcp(state, 'laptop')
    expect(result.ok && result.ip).toBe('192.168.10.100')
  })

  it('fails with dhcpPoolExhausted when the range is full', () => {
    const base = withNewDhcpHost(withExtraPort(officeLab(), 'Fa0/5', 1), 'Fa0/5')
    const state = editRouterServices(base, (services) => ({
      ...services,
      dhcp: services.dhcp && {
        ...services.dhcp,
        pools: services.dhcp.pools.map((pool) => ({ ...pool, range: { start: '192.168.1.101', end: '192.168.1.101' } })),
      },
    }))
    expect(engine.renewDhcp(state, 'laptop')).toEqual({ ok: false, reason: 'dhcpPoolExhausted' })
  })

  it('fails with dhcpNoServer when no router serves the VLAN', () => {
    const state = withNewDhcpHost(withExtraPort(officeLab(), 'Fa0/5', 30), 'Fa0/5')
    expect(engine.renewDhcp(state, 'laptop')).toEqual({ ok: false, reason: 'dhcpNoServer' })

    const noPools = editRouterServices(officeLab(), (services) => ({ ...services, dhcp: services.dhcp && { ...services.dhcp, pools: [] } }))
    expect(engine.renewDhcp(noPools, 'pc2')).toEqual({ ok: false, reason: 'dhcpNoServer' })
  })

  it('refuses static hosts with invalidConfig', () => {
    expect(engine.renewDhcp(officeLab(), 'pc1')).toEqual({ ok: false, reason: 'invalidConfig' })
  })

  it('replaces a stale lease record instead of reusing an address that is now taken', () => {
    // The printer took pc2's leased address statically; pc2 gets a new one and keeps a single record.
    const state = editNic(officeLab(), 'printer', { address: '192.168.1.101' })
    const result = engine.renewDhcp(state, 'pc2')
    if (!result.ok) throw new Error(`renew failed: ${result.reason}`)
    expect(result.ip).toBe('192.168.1.100')
    expect(poolsOf(result.nextState)?.[0]?.leases).toEqual([{ mac: labDevice(state, 'pc2').ports[0]?.mac, ip: '192.168.1.100' }])
  })

  it('does not reuse a lease outside the pool range', () => {
    const state = editRouterServices(officeLab(), (services) => ({
      ...services,
      dhcp: services.dhcp && {
        ...services.dhcp,
        pools: services.dhcp.pools.map((pool) => ({ ...pool, range: { start: '192.168.1.150', end: '192.168.1.200' } })),
      },
    }))
    // .150 is the printer's static address.
    expect(engine.renewDhcp(state, 'pc2')).toMatchObject({ ok: true, ip: '192.168.1.151' })
  })

  it('reports link problems before looking for a server', () => {
    const state = shutPort(officeLab(), 'switch', 'Fa0/3')
    expect(engine.renewDhcp(state, 'pc2')).toEqual({ ok: false, reason: 'portDisabled' })
  })
})

describe('DhcpService — release', () => {
  it('clears the address of a DHCP host and keeps the lease record', () => {
    const state = officeLab()
    const result = dhcp.release(state, 'pc2')
    if (!result.ok) throw new Error(`release failed: ${result.reason}`)
    expect(nicOf(result.nextState, 'pc2')).toEqual({ addressing: 'dhcp', address: '', mask: '' })
    expect(labDevice(result.nextState, 'pc2').host).toEqual({ defaultGateway: '', dnsServers: [], appLinks: [] })
    expect(poolsOf(result.nextState)).toEqual(poolsOf(state))
    expect(nicOf(state, 'pc2')?.address).toBe('192.168.1.101')
  })

  it('refuses static hosts and hosts without a link', () => {
    expect(dhcp.release(officeLab(), 'pc1')).toEqual({ ok: false, reason: 'invalidConfig' })
    const unplugged = shutPort(officeLab(), 'switch', 'Fa0/3')
    // The failure also names the NIC it happened on.
    expect(dhcp.release(unplugged, 'pc2')).toEqual({ ok: false, reason: 'portDisabled', portId: 'eth0' })
  })
})

/**
 * Router r: Gi0/0 192.168.1.1 and Gi0/1 192.168.2.1, a pool per subnet. Host `multi` has eth0 on Gi0/0
 * and eth1 on Gi0/1, both DHCP without an address unless `eth0Static` is given.
 */
function twoNicLab(eth0Static?: { gateway: string; dns: string[] }): NetworkState {
  const base = labHost(
    'multi',
    eth0Static ? '192.168.1.20' : '',
    eth0Static ? { gateway: eth0Static.gateway, dns: eth0Static.dns } : { addressing: 'dhcp' },
  )
  const eth1: Port = { id: 'eth1', medium: 'copper', role: 'host', adminUp: true, mac: '02:00:00:EE:10:01', l3: { ipv4: { addressing: 'dhcp', address: '', mask: '' } } }
  const router = labRouter('r', [
    { id: 'Gi0/0', ip: '192.168.1.1' },
    { id: 'Gi0/1', ip: '192.168.2.1' },
  ])
  return {
    devices: [
      { ...router, services: { dhcp: { enabled: true, pools: [officePool('p1', '192.168.1'), officePool('p2', '192.168.2')], excludedRanges: [] } } },
      { ...base, ports: [...base.ports, eth1] },
    ],
    links: [
      labLink('l0', ['multi', 'eth0'], ['r', 'Gi0/0'], { cable: 'copperCross' }),
      labLink('l1', ['multi', 'eth1'], ['r', 'Gi0/1'], { cable: 'copperCross' }),
    ],
  }
}

function nic(state: NetworkState, portId: string) {
  const port = labDevice(state, 'multi').ports.find((candidate) => candidate.id === portId)
  return port?.role === 'host' ? port.l3.ipv4.address : undefined
}

function renewed(state: NetworkState, portId?: string): NetworkState {
  const result = engine.renewDhcp(state, 'multi', portId)
  if (!result.ok) throw new Error(`renew failed: ${result.reason}`)
  return result.nextState
}

function released(state: NetworkState, portId?: string): NetworkState {
  const result = dhcp.release(state, 'multi', portId)
  if (!result.ok) throw new Error(`release failed: ${result.reason}`)
  return result.nextState
}

describe('DhcpService — gateway and DNS with several NICs', () => {
  it('keeps the gateway and DNS of a static NIC when a DHCP NIC renews', () => {
    const state = renewed(twoNicLab({ gateway: '192.168.1.254', dns: ['8.8.8.8'] }))
    expect(nic(state, 'eth1')).toBe('192.168.2.100')
    expect(labDevice(state, 'multi').host).toMatchObject({ defaultGateway: '192.168.1.254', dnsServers: ['8.8.8.8'] })
  })

  it('lets a DHCP NIC fill gateway and DNS a static NIC left empty', () => {
    const state = renewed(twoNicLab({ gateway: '', dns: [] }))
    expect(labDevice(state, 'multi').host).toMatchObject({ defaultGateway: '192.168.2.1', dnsServers: ['192.168.2.1'] })
  })

  it('keeps the static NIC settings when the DHCP NIC is released', () => {
    const state = released(renewed(twoNicLab({ gateway: '192.168.1.254', dns: ['8.8.8.8'] })))
    expect(nic(state, 'eth0')).toBe('192.168.1.20')
    expect(nic(state, 'eth1')).toBe('')
    expect(labDevice(state, 'multi').host).toMatchObject({ defaultGateway: '192.168.1.254', dnsServers: ['8.8.8.8'] })
  })

  it('takes gateway and DNS from the latest lease when both NICs use DHCP', () => {
    const both = renewed(twoNicLab())
    expect([nic(both, 'eth0'), nic(both, 'eth1')]).toEqual(['192.168.1.100', '192.168.2.100'])
    expect(labDevice(both, 'multi').host).toMatchObject({ defaultGateway: '192.168.2.1', dnsServers: ['192.168.2.1'] })
    const eth0Again = renewed(both, 'eth0')
    expect(labDevice(eth0Again, 'multi').host).toMatchObject({ defaultGateway: '192.168.1.1', dnsServers: ['192.168.1.1'] })
  })

  it('clears gateway and DNS only when the last addressed NIC is released', () => {
    const both = renewed(twoNicLab())
    const oneLeft = released(both, 'eth1')
    expect(nic(oneLeft, 'eth0')).toBe('192.168.1.100')
    expect(labDevice(oneLeft, 'multi').host).toMatchObject({ defaultGateway: '192.168.2.1', dnsServers: ['192.168.2.1'] })
    const none = released(oneLeft, 'eth0')
    expect(labDevice(none, 'multi').host).toMatchObject({ defaultGateway: '', dnsServers: [] })
    // Releasing both at once clears them too.
    expect(labDevice(released(both), 'multi').host).toMatchObject({ defaultGateway: '', dnsServers: [] })
  })
})
