import { describe, expect, it } from 'vitest'
import type { Device, DhcpServerSettings, NetworkState } from '../domain'
import { DefaultNetworkEngine } from './DefaultNetworkEngine'
import { accessMode, editDevice, editLink, editPort, labDevice, labHost, labLink, labRouter, labSwitch, textOf } from './testLabs'

const engine = new DefaultNetworkEngine()

const DHCP: DhcpServerSettings = {
  enabled: true,
  // The 192.168.2.0 pool comes first: the pool is picked by the receiving interface, not by order.
  pools: [
    { id: 'lan2', network: '192.168.2.0', mask: '255.255.255.0', defaultRouter: '192.168.2.1', dnsServers: ['192.168.2.1'], leases: [] },
    { id: 'lan1', network: '192.168.1.0', mask: '255.255.255.0', defaultRouter: '192.168.1.1', dnsServers: ['192.168.1.1', '8.8.8.8'], leases: [] },
  ],
  excludedRanges: [{ start: '192.168.1.1', end: '192.168.1.10' }],
}

/** r Gi0/0 192.168.1.1 — sw — client (DHCP) and printer .11; r Gi0/1 192.168.2.1 — client2 (DHCP). */
function dhcpLab(): NetworkState {
  const router: Device = { ...labRouter('r', [{ id: 'Gi0/0', ip: '192.168.1.1' }, { id: 'Gi0/1', ip: '192.168.2.1' }]), services: { dhcp: DHCP } }
  return {
    devices: [
      router,
      labSwitch('sw', [accessMode(1), accessMode(1), accessMode(1)]),
      labHost('client', '', { addressing: 'dhcp' }),
      labHost('printer', '192.168.1.11', { kind: 'printer', gateway: '192.168.1.1' }),
      labHost('client2', '', { addressing: 'dhcp' }),
    ],
    links: [
      labLink('uplink', ['r', 'Gi0/0'], ['sw', 'Fa0/1']),
      labLink('clientLink', ['client', 'eth0'], ['sw', 'Fa0/2']),
      labLink('printerLink', ['printer', 'eth0'], ['sw', 'Fa0/3']),
      labLink('client2Link', ['client2', 'eth0'], ['r', 'Gi0/1'], { cable: 'copperCross' }),
    ],
  }
}

function nicOf(state: NetworkState, deviceId: string) {
  const port = labDevice(state, deviceId).ports[0]
  return port?.role === 'host' ? port.l3.ipv4 : undefined
}

describe('DHCP by interface subnet', () => {
  it('serves the pool of the receiving interface subnet, skipping exclusions and used addresses', () => {
    const lab = dhcpLab()
    const result = engine.renewDhcp(lab, 'client')
    expect(result).toMatchObject({ ok: true, ip: '192.168.1.12' })
    if (!result.ok) return
    expect(nicOf(result.nextState, 'client')).toEqual({ addressing: 'dhcp', address: '192.168.1.12', mask: '255.255.255.0' })
    expect(labDevice(result.nextState, 'client').host).toMatchObject({ defaultGateway: '192.168.1.1', dnsServers: ['192.168.1.1', '8.8.8.8'] })
    expect(labDevice(result.nextState, 'r').services?.dhcp?.pools[1]?.leases).toEqual([{ mac: labDevice(lab, 'client').ports[0]?.mac ?? '', ip: '192.168.1.12' }])
    expect(labDevice(result.nextState, 'printer')).toBe(labDevice(lab, 'printer'))
    expect(engine.reach(result.nextState, 'client', '192.168.1.11')).toMatchObject({ ok: true })
  })

  it('serves the other pool on the other interface, and only the requested NIC', () => {
    expect(engine.renewDhcp(dhcpLab(), 'client2', 'eth0')).toMatchObject({ ok: true, ip: '192.168.2.2' })
    expect(engine.renewDhcp(dhcpLab(), 'client2', 'wlan0')).toEqual({ ok: false, reason: 'invalidConfig' })
  })

  it('keeps the lease across release and renew', () => {
    const first = engine.runCommand(dhcpLab(), 'client', 'ipconfig /renew').nextState
    const released = first && engine.runCommand(first, 'client', 'ipconfig /release').nextState
    expect(released && nicOf(released, 'client')).toEqual({ addressing: 'dhcp', address: '', mask: '' })
    const again = released && engine.renewDhcp(editDevice(released, 'printer', (device) => ({ ...device, powered: false })), 'client')
    expect(again).toMatchObject({ ok: true, ip: '192.168.1.12' })
  })

  it('has no server when the service is off or no pool matches the subnet', () => {
    const off = editDevice(dhcpLab(), 'r', (router) => ({ ...router, services: { dhcp: { ...DHCP, enabled: false } } }))
    expect(engine.renewDhcp(off, 'client')).toEqual({ ok: false, reason: 'dhcpNoServer' })
    const noPool = editDevice(dhcpLab(), 'r', (router) => ({ ...router, services: { dhcp: { ...DHCP, pools: DHCP.pools.slice(0, 1) } } }))
    expect(engine.renewDhcp(noPool, 'client')).toEqual({ ok: false, reason: 'dhcpNoServer' })
    expect(textOf(engine.runCommand(noPool, 'client', 'ipconfig /renew').lines)).toContain(
      'An error occurred while renewing interface Ethernet : unable to contact your DHCP server. Request has timed out.',
    )
  })

  it('runs out of addresses inside the range', () => {
    const tiny = editDevice(dhcpLab(), 'r', (router) => ({
      ...router,
      services: { dhcp: { ...DHCP, pools: DHCP.pools.map((pool) => ({ ...pool, range: { start: '192.168.1.11', end: '192.168.1.11' } })) } },
    }))
    expect(engine.renewDhcp(tiny, 'client')).toEqual({ ok: false, reason: 'dhcpPoolExhausted' })
  })
})

describe('host with two NICs', () => {
  it('lists every linked adapter in ipconfig and renews only the DHCP one', () => {
    const lab = dhcpLab()
    const laptop: Device = {
      ...labHost('laptop', '', { kind: 'laptop', addressing: 'dhcp' }),
      ports: [
        ...labHost('x', '', { addressing: 'dhcp' }).ports,
        ...labHost('y', '192.168.2.20', { nic: { id: 'eth1', medium: 'copper' } }).ports,
      ],
    }
    const state: NetworkState = {
      devices: [...lab.devices.filter((device) => device.id !== 'client2'), laptop],
      links: [...lab.links.filter((link) => link.id !== 'client2Link'), labLink('l1', ['laptop', 'eth0'], ['sw', 'Fa0/2']), labLink('l2', ['laptop', 'eth1'], ['r', 'Gi0/1'])],
    }
    const withoutClient: NetworkState = {
      devices: state.devices.filter((device) => device.id !== 'client'),
      links: state.links.filter((link) => link.id !== 'clientLink'),
    }
    const output = textOf(engine.runCommand(withoutClient, 'laptop', 'ipconfig').lines)
    expect(output).toContain('Ethernet adapter Ethernet:')
    expect(output).toContain('Ethernet adapter Ethernet 2:')
    expect(output).toContain('   IPv4 Address. . . . . . . . . . . : 192.168.2.20')
    const renewed = engine.renewDhcp(withoutClient, 'laptop')
    expect(renewed).toMatchObject({ ok: true, ip: '192.168.1.12' })
    expect(engine.reach(withoutClient, 'laptop', '192.168.2.1')).toMatchObject({ ok: true, path: ['laptop', 'r'] })
  })
})

describe('link lights', () => {
  it('needs the textbook cable when auto-MDIX is off on both ends', () => {
    const mdixOff = editPort(editPort(dhcpLab(), 'client2', 'eth0', (port) => ({ ...port, autoMdix: false })), 'r', 'Gi0/1', (port) => ({ ...port, autoMdix: false }))
    expect(engine.linkLight(mdixOff, 'client2Link')).toBe('up')
    const straight = editLink(mdixOff, 'client2Link', (link) => ({ ...link, cable: 'copperStraight' }))
    expect(engine.linkLight(straight, 'client2Link')).toBe('down')
    expect(engine.renewDhcp(straight, 'client2')).toEqual({ ok: false, reason: 'cableDisconnected' })
    // One end with auto-MDIX is enough for any copper cable.
    const oneEnd = editPort(straight, 'r', 'Gi0/1', (port) => ({ ...port, autoMdix: true }))
    expect(engine.linkLight(oneEnd, 'client2Link')).toBe('up')
  })

  it('needs an SSID the radio offers for a wireless association', () => {
    const ap: Device = {
      id: 'ap',
      kind: 'accessPoint',
      modelId: 'accessPoint',
      name: 'ap',
      powered: true,
      baseMac: '02:00:00:00:FE:01',
      ports: [
        { id: 'Gi0', medium: 'copper', role: 'switched', adminUp: true, l2: { mode: 'trunk', accessVlan: 1, nativeVlan: 1, allowedVlans: 'all' } },
        { id: 'Radio0', medium: 'wireless', role: 'radio', adminUp: true },
      ],
      wireless: { ssids: [{ ssid: 'Office', vlan: 1, security: { mode: 'open' } }] },
    }
    const phone = labHost('phone', '192.168.1.40', { kind: 'smartphone', gateway: '192.168.1.1', nic: { id: 'wlan0', medium: 'wireless' } })
    const lab = dhcpLab()
    const state: NetworkState = {
      devices: [...lab.devices, ap, phone],
      links: [
        ...lab.links.filter((link) => link.id !== 'printerLink'),
        labLink('apLink', ['ap', 'Gi0'], ['sw', 'Fa0/3']),
        labLink('air', ['phone', 'wlan0'], ['ap', 'Radio0'], { cable: 'wireless', ssid: 'Office' }),
      ],
    }
    expect(engine.linkLight(state, 'air')).toBe('up')
    expect(engine.reach(state, 'phone', '192.168.1.1')).toEqual({ ok: true, path: ['phone', 'ap', 'sw', 'r'] })
    const wrong = editLink(state, 'air', (link) => ({ ...link, cable: 'wireless', ssid: 'Guest' }))
    expect(engine.linkLight(wrong, 'air')).toBe('down')
    expect(engine.reach(wrong, 'phone', '192.168.1.1')).toEqual({ ok: false, reason: 'cableDisconnected', atDeviceId: 'ap' })
  })

  it('throws for an unknown link id', () => {
    expect(() => engine.linkLight(dhcpLab(), 'nope')).toThrow('Unknown link id: nope')
  })
})
