import { describe, expect, it } from 'vitest'
import type { NetworkState, Port } from '../domain'
import { DefaultNetworkEngine } from './DefaultNetworkEngine'
import { DhcpService } from './DhcpService'
import { SegmentFinder } from './SegmentFinder'
import { accessMode, editDevice, labDevice, labHost, labLink } from './testLabs'
import { editNic, editRouterServices, officeLab, shutPort, vlanLab } from './testNetworks'

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
