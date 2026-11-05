import { describe, expect, it } from 'vitest'
import type { NetworkState } from '../domain/NetworkTypes'
import { DhcpService } from './DhcpService'
import { SegmentFinder } from './SegmentFinder'
import { deviceOf, makeHost, makeLink, officeNetwork, updateDevice, updatePort, vlanNetwork } from './testFixtures'

const dhcp = new DhcpService(new SegmentFinder())

function withNewDhcpHost(state: NetworkState, portId: string): NetworkState {
  return {
    devices: [...state.devices, makeHost('laptop', 'pc', { mode: 'dhcp' })],
    links: [...state.links, makeLink('laptopLink', ['laptop', 'eth0'], ['switch', portId])],
  }
}

function withExtraPort(state: NetworkState, portId: string, vlan: number): NetworkState {
  return updateDevice(state, 'switch', (device) => ({
    ...device,
    switchPorts: [...(device.switchPorts ?? []), { id: portId, vlan, mode: 'access', enabled: true, poe: false }],
  }))
}

describe('DhcpService', () => {
  it('reuses the existing lease for the MAC', () => {
    const result = dhcp.renew(officeNetwork(), 'pc2')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ip).toBe('192.168.1.101')
    const router = deviceOf(result.nextState, 'router')
    expect(router.dhcpPools?.[0]?.leases).toHaveLength(1)
  })

  it('hands out the first free address and records a new lease', () => {
    const state = withNewDhcpHost(withExtraPort(officeNetwork(), 'Fa0/5', 1), 'Fa0/5')
    const result = dhcp.renew(state, 'laptop')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ip).toBe('192.168.1.100')
    expect(deviceOf(result.nextState, 'laptop').host).toEqual({
      mode: 'dhcp',
      ip: '192.168.1.100',
      mask: '255.255.255.0',
      gateway: '192.168.1.1',
      dns: ['192.168.1.1'],
    })
    const leases = deviceOf(result.nextState, 'router').dhcpPools?.[0]?.leases ?? []
    expect(leases.map((lease) => lease.ip)).toEqual(['192.168.1.101', '192.168.1.100'])
  })

  it('skips addresses used by static devices', () => {
    const base = withNewDhcpHost(withExtraPort(officeNetwork(), 'Fa0/5', 1), 'Fa0/5')
    const state = updateDevice(base, 'printer', (device) =>
      device.host ? { ...device, host: { ...device.host, ip: '192.168.1.100' } } : device,
    )
    const result = dhcp.renew(state, 'laptop')
    expect(result.ok && result.ip).toBe('192.168.1.102')
  })

  it('serves the pool of the host VLAN', () => {
    const state = withNewDhcpHost(withExtraPort(vlanNetwork(), 'Fa0/6', 10), 'Fa0/6')
    const result = dhcp.renew(state, 'laptop')
    expect(result.ok && result.ip).toBe('192.168.10.100')
  })

  it('fails with dhcpPoolExhausted when the range is full', () => {
    const base = withNewDhcpHost(withExtraPort(officeNetwork(), 'Fa0/5', 1), 'Fa0/5')
    const state = updateDevice(base, 'router', (router) => ({
      ...router,
      dhcpPools: (router.dhcpPools ?? []).map((pool) => ({ ...pool, rangeStart: '192.168.1.101', rangeEnd: '192.168.1.101' })),
    }))
    expect(dhcp.renew(state, 'laptop')).toEqual({ ok: false, reason: 'dhcpPoolExhausted' })
  })

  it('fails with dhcpNoServer when no router serves the VLAN', () => {
    const state = withNewDhcpHost(withExtraPort(officeNetwork(), 'Fa0/5', 30), 'Fa0/5')
    expect(dhcp.renew(state, 'laptop')).toEqual({ ok: false, reason: 'dhcpNoServer' })

    const noPools = updateDevice(officeNetwork(), 'router', (router) => ({ ...router, dhcpPools: [] }))
    expect(dhcp.renew(noPools, 'pc2')).toEqual({ ok: false, reason: 'dhcpNoServer' })
  })

  it('refuses static hosts with invalidConfig', () => {
    expect(dhcp.renew(officeNetwork(), 'pc1')).toEqual({ ok: false, reason: 'invalidConfig' })
  })

  it('reports link problems before looking for a server', () => {
    const state = updatePort(officeNetwork(), 'switch', 'Fa0/3', { enabled: false })
    expect(dhcp.renew(state, 'pc2')).toEqual({ ok: false, reason: 'portDisabled' })
  })
})

describe('DhcpService — release', () => {
  it('clears the address of a DHCP host and keeps the lease record', () => {
    const state = officeNetwork()
    const result = dhcp.release(state, 'pc2')
    if (!result.ok) throw new Error(`release failed: ${result.reason}`)
    expect(deviceOf(result.nextState, 'pc2').host).toEqual({ mode: 'dhcp', ip: '', mask: '', gateway: '', dns: [] })
    expect(deviceOf(result.nextState, 'router').dhcpPools).toEqual(deviceOf(state, 'router').dhcpPools)
    expect(deviceOf(state, 'pc2').host?.ip).toBe('192.168.1.101')
  })

  it('refuses static hosts and hosts without a link', () => {
    expect(dhcp.release(officeNetwork(), 'pc1')).toEqual({ ok: false, reason: 'invalidConfig' })
    const unplugged = updatePort(officeNetwork(), 'switch', 'Fa0/3', { enabled: false })
    expect(dhcp.release(unplugged, 'pc2')).toEqual({ ok: false, reason: 'portDisabled' })
  })
})
