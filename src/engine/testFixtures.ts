// Test-only helpers: small NetworkState builders and immutable editing helpers.
import type {
  Device,
  DeviceKind,
  DhcpPool,
  HostNetworkConfig,
  Link,
  NetworkState,
  RouterInterface,
  SwitchPort,
} from '../domain/NetworkTypes'

const ORIGIN = { x: 0, y: 0 }
const MASK = '255.255.255.0'

let macCounter = 0
function nextMac(): string {
  macCounter += 1
  const hex = macCounter.toString(16).toUpperCase().padStart(2, '0')
  return `AA:BB:CC:00:00:${hex}`
}

export function makeHost(
  id: string,
  kind: DeviceKind,
  host: Partial<HostNetworkConfig>,
  extra: Partial<Device> = {},
): Device {
  return {
    id,
    kind,
    name: id,
    mac: nextMac(),
    position: ORIGIN,
    powered: true,
    host: { mode: 'static', ip: '', mask: MASK, gateway: '', dns: [], ...host },
    ...extra,
  }
}

export function makeRouter(
  id: string,
  interfaces: RouterInterface[],
  extra: Partial<Device> = {},
): Device {
  return {
    id,
    kind: 'router',
    name: 'Modem / Router',
    mac: nextMac(),
    position: ORIGIN,
    powered: true,
    routerInterfaces: interfaces,
    dhcpPools: [],
    wanUp: true,
    dnsForwarding: true,
    ...extra,
  }
}

export function makePool(id: string, vlan: number, base: string, start: number, end: number, leases: DhcpPool['leases'] = []): DhcpPool {
  return {
    id,
    vlan,
    rangeStart: `${base}.${start}`,
    rangeEnd: `${base}.${end}`,
    mask: MASK,
    gateway: `${base}.1`,
    dns: [`${base}.1`],
    leases,
  }
}

export function accessPort(id: string, vlan: number): SwitchPort {
  return { id, vlan, mode: 'access', enabled: true, poe: false }
}

export function trunkPort(id: string): SwitchPort {
  return { id, vlan: 1, mode: 'trunk', enabled: true, poe: false }
}

export function makeSwitch(id: string, ports: SwitchPort[]): Device {
  return { id, kind: 'switch', name: 'Switch', mac: nextMac(), position: ORIGIN, powered: true, switchPorts: ports }
}

export function makeInternet(): Device {
  return { id: 'internet', kind: 'internet', name: 'İnternet', mac: nextMac(), position: ORIGIN, powered: true }
}

export function makeLink(id: string, a: [string, string], b: [string, string], ssid?: string): Link {
  const link: Link = { id, a: { deviceId: a[0], portId: a[1] }, b: { deviceId: b[0], portId: b[1] }, connected: true }
  return ssid === undefined ? link : { ...link, ssid }
}

/**
 * Flat office: internet — router(192.168.1.1, VLAN 1) — switch.
 * pc1 static .20 (Fa0/2), pc2 dhcp .101 (Fa0/3, leased), printer static .150 (Fa0/4).
 */
export function officeNetwork(): NetworkState {
  const pc2 = makeHost('pc2', 'pc', { mode: 'dhcp', ip: '192.168.1.101', gateway: '192.168.1.1', dns: ['192.168.1.1'] })
  return {
    devices: [
      makeInternet(),
      makeRouter('router', [{ id: 'LAN', vlan: 1, ip: '192.168.1.1', mask: MASK }], {
        dhcpPools: [makePool('pool1', 1, '192.168.1', 100, 200, [{ mac: pc2.mac, ip: '192.168.1.101' }])],
      }),
      makeSwitch('switch', [trunkPort('Fa0/1'), accessPort('Fa0/2', 1), accessPort('Fa0/3', 1), accessPort('Fa0/4', 1)]),
      makeHost('pc1', 'pc', { ip: '192.168.1.20', gateway: '192.168.1.1', dns: ['8.8.8.8'] }, {
        appLinks: [{ id: 'printerLink', label: 'Yazıcı', targetIp: '192.168.1.150', targetKind: 'printer' }],
      }),
      pc2,
      makeHost('printer', 'printer', { ip: '192.168.1.150', gateway: '192.168.1.1' }),
    ],
    links: [
      makeLink('wan', ['internet', 'wan'], ['router', 'wan']),
      makeLink('uplink', ['router', 'lan'], ['switch', 'Fa0/1']),
      makeLink('pc1Link', ['pc1', 'eth0'], ['switch', 'Fa0/2']),
      makeLink('pc2Link', ['pc2', 'eth0'], ['switch', 'Fa0/3']),
      makeLink('printerLink', ['printer', 'eth0'], ['switch', 'Fa0/4']),
    ],
  }
}

/**
 * Two VLANs on one switch: router-on-a-stick LAN.10 192.168.10.1 / LAN.20 192.168.20.1.
 * kasa .10.20 (Fa0/2, VLAN 10), kitchen .10.30 (Fa0/3, VLAN 10), guestPc .20.50 (Fa0/5, VLAN 20),
 * AP on trunk Fa0/4 with SSIDs Isletme→10, Misafir→20, phone dhcp on 'Misafir' (.20.101 leased).
 */
export function vlanNetwork(): NetworkState {
  const phone = makeHost('phone', 'phone', { mode: 'dhcp', ip: '192.168.20.101', gateway: '192.168.20.1', dns: ['192.168.20.1'] })
  return {
    devices: [
      makeInternet(),
      makeRouter(
        'router',
        [
          { id: 'LAN.10', vlan: 10, ip: '192.168.10.1', mask: MASK },
          { id: 'LAN.20', vlan: 20, ip: '192.168.20.1', mask: MASK },
        ],
        {
          dhcpPools: [
            makePool('pool10', 10, '192.168.10', 100, 200),
            makePool('pool20', 20, '192.168.20', 100, 200, [{ mac: phone.mac, ip: '192.168.20.101' }]),
          ],
        },
      ),
      makeSwitch('switch', [
        trunkPort('Fa0/1'),
        accessPort('Fa0/2', 10),
        accessPort('Fa0/3', 10),
        trunkPort('Fa0/4'),
        accessPort('Fa0/5', 20),
      ]),
      {
        id: 'ap',
        kind: 'accessPoint',
        name: 'AP',
        mac: nextMac(),
        position: ORIGIN,
        powered: true,
        wirelessNetworks: [
          { ssid: 'Isletme', vlan: 10 },
          { ssid: 'Misafir', vlan: 20 },
        ],
      },
      makeHost('kasa', 'pos', { ip: '192.168.10.20', gateway: '192.168.10.1', dns: ['192.168.10.1'] }, {
        appLinks: [{ id: 'kitchenLink', label: 'Mutfak ekranı', targetIp: '192.168.10.30', targetKind: 'kitchenDisplay' }],
      }),
      makeHost('kitchen', 'kitchenDisplay', { ip: '192.168.10.30', gateway: '192.168.10.1' }),
      makeHost('guestPc', 'pc', { ip: '192.168.20.50', gateway: '192.168.20.1', dns: ['192.168.20.1'] }),
      phone,
    ],
    links: [
      makeLink('wan', ['internet', 'wan'], ['router', 'wan']),
      makeLink('uplink', ['router', 'lan'], ['switch', 'Fa0/1']),
      makeLink('kasaLink', ['kasa', 'eth0'], ['switch', 'Fa0/2']),
      makeLink('kitchenLink', ['kitchen', 'eth0'], ['switch', 'Fa0/3']),
      makeLink('apLink', ['ap', 'uplink'], ['switch', 'Fa0/4']),
      makeLink('guestLink', ['guestPc', 'eth0'], ['switch', 'Fa0/5']),
      makeLink('phoneLink', ['phone', 'wlan0'], ['ap', 'radio'], 'Misafir'),
    ],
  }
}

export function updateDevice(state: NetworkState, id: string, change: (device: Device) => Device): NetworkState {
  return { ...state, devices: state.devices.map((device) => (device.id === id ? change(device) : device)) }
}

export function updateHost(state: NetworkState, id: string, patch: Partial<HostNetworkConfig>): NetworkState {
  return updateDevice(state, id, (device) => {
    if (!device.host) throw new Error(`Device ${id} has no host config`)
    return { ...device, host: { ...device.host, ...patch } }
  })
}

export function updatePort(state: NetworkState, switchId: string, portId: string, patch: Partial<SwitchPort>): NetworkState {
  return updateDevice(state, switchId, (device) => ({
    ...device,
    switchPorts: (device.switchPorts ?? []).map((port) => (port.id === portId ? { ...port, ...patch } : port)),
  }))
}

export function updateLink(state: NetworkState, linkId: string, patch: Partial<Link>): NetworkState {
  return { ...state, links: state.links.map((link) => (link.id === linkId ? { ...link, ...patch } : link)) }
}

export function deviceOf(state: NetworkState, id: string): Device {
  const device = state.devices.find((candidate) => candidate.id === id)
  if (!device) throw new Error(`Fixture has no device ${id}`)
  return device
}

/** Recursively freezes a value so any mutation attempt throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
  }
  return value
}
