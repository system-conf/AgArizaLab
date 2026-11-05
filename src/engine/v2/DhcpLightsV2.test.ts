import { describe, expect, it } from 'vitest'
import type { DeviceV2, DhcpServerSettings, NetworkStateV2 } from '../../domain/v2'
import { DefaultNetworkEngineV2 } from './DefaultNetworkEngineV2'
import { accessV2, deviceV2, editDevice, editLink, editPort, hostV2, linkV2, routerV2, switchV2, textOf } from './testLabsV2'

const engine = new DefaultNetworkEngineV2()

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
function dhcpLab(): NetworkStateV2 {
  const router: DeviceV2 = { ...routerV2('r', [{ id: 'Gi0/0', ip: '192.168.1.1' }, { id: 'Gi0/1', ip: '192.168.2.1' }]), services: { dhcp: DHCP } }
  return {
    devices: [
      router,
      switchV2('sw', [accessV2(1), accessV2(1), accessV2(1)]),
      hostV2('client', '', { addressing: 'dhcp' }),
      hostV2('printer', '192.168.1.11', { kind: 'printer', gateway: '192.168.1.1' }),
      hostV2('client2', '', { addressing: 'dhcp' }),
    ],
    links: [
      linkV2('uplink', ['r', 'Gi0/0'], ['sw', 'Fa0/1']),
      linkV2('clientLink', ['client', 'eth0'], ['sw', 'Fa0/2']),
      linkV2('printerLink', ['printer', 'eth0'], ['sw', 'Fa0/3']),
      linkV2('client2Link', ['client2', 'eth0'], ['r', 'Gi0/1'], { cable: 'copperCross' }),
    ],
  }
}

function nicOf(state: NetworkStateV2, deviceId: string) {
  const port = deviceV2(state, deviceId).ports[0]
  return port?.role === 'host' ? port.l3.ipv4 : undefined
}

describe('DHCP on v2', () => {
  it('serves the pool of the receiving interface subnet, skipping exclusions and used addresses', () => {
    const lab = dhcpLab()
    const result = engine.renewDhcp(lab, 'client')
    expect(result).toMatchObject({ ok: true, ip: '192.168.1.12' })
    if (!result.ok) return
    expect(nicOf(result.nextState, 'client')).toEqual({ addressing: 'dhcp', address: '192.168.1.12', mask: '255.255.255.0' })
    expect(deviceV2(result.nextState, 'client').host).toMatchObject({ defaultGateway: '192.168.1.1', dnsServers: ['192.168.1.1', '8.8.8.8'] })
    expect(deviceV2(result.nextState, 'r').services?.dhcp?.pools[1]?.leases).toEqual([{ mac: deviceV2(lab, 'client').ports[0]?.mac ?? '', ip: '192.168.1.12' }])
    expect(deviceV2(result.nextState, 'printer')).toBe(deviceV2(lab, 'printer'))
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
    const laptop: DeviceV2 = {
      ...hostV2('laptop', '', { kind: 'laptop', addressing: 'dhcp' }),
      ports: [
        ...hostV2('x', '', { addressing: 'dhcp' }).ports,
        ...hostV2('y', '192.168.2.20', { nic: { id: 'eth1', medium: 'copper' } }).ports,
      ],
    }
    const state: NetworkStateV2 = {
      devices: [...lab.devices.filter((device) => device.id !== 'client2'), laptop],
      links: [...lab.links.filter((link) => link.id !== 'client2Link'), linkV2('l1', ['laptop', 'eth0'], ['sw', 'Fa0/2']), linkV2('l2', ['laptop', 'eth1'], ['r', 'Gi0/1'])],
    }
    const withoutClient: NetworkStateV2 = {
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
    const ap: DeviceV2 = {
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
    const phone = hostV2('phone', '192.168.1.40', { kind: 'smartphone', gateway: '192.168.1.1', nic: { id: 'wlan0', medium: 'wireless' } })
    const lab = dhcpLab()
    const state: NetworkStateV2 = {
      devices: [...lab.devices, ap, phone],
      links: [
        ...lab.links.filter((link) => link.id !== 'printerLink'),
        linkV2('apLink', ['ap', 'Gi0'], ['sw', 'Fa0/3']),
        linkV2('air', ['phone', 'wlan0'], ['ap', 'Radio0'], { cable: 'wireless', ssid: 'Office' }),
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
