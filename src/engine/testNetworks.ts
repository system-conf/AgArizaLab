// Test-only: the two reference networks of the engine tests (the fixtures the first engine was
// specified against, PLAN §4) as labs, plus the edits the tests apply to them.
import type { Device, DhcpServerSettings, DnsServerSettings, NetworkState, Port, StaticRoute } from '../domain'
import { accessMode, editDevice, editLink, editPort, labCloud, labHost, labLink, labRouter, labSwitch, trunkMode } from './testLabs'

const MASK = '255.255.255.0'
const DEFAULT_ROUTE: StaticRoute = { prefix: '0.0.0.0', mask: '0.0.0.0', exitInterfaceId: 'Gi0/1', adminDistance: 1 }
const DNS_FORWARDING: DnsServerSettings = { enabled: true, forwarders: ['8.8.8.8'], records: [] }

/** Pool `<base>.0/24` handing out `<base>.100`–`<base>.200`, gateway and DNS `<base>.1`. */
export function officePool(id: string, base: string, leases: Array<{ mac: string; ip: string }> = []) {
  return {
    id,
    network: `${base}.0`,
    mask: MASK,
    range: { start: `${base}.100`, end: `${base}.200` },
    defaultRouter: `${base}.1`,
    dnsServers: [`${base}.1`],
    leases,
  }
}

/**
 * The internet gateway of both networks: LAN on Gi0/0, WAN Gi0/1 (DHCP, no address) cabled to the
 * cloud, default route out of Gi0/1, DHCP and DNS forwarding to 8.8.8.8.
 */
function gatewayRouter(lan: Parameters<typeof labRouter>[1][number], pools: DhcpServerSettings['pools']): Device {
  return {
    ...labRouter('router', [lan, { id: 'Gi0/1', addressing: 'dhcp' }], [DEFAULT_ROUTE]),
    name: 'Modem / Router',
    services: { dhcp: { enabled: true, pools, excludedRanges: [] }, dns: DNS_FORWARDING },
  }
}

function named(device: Device, name: string): Device {
  return { ...device, name }
}

function macOf(device: Device): string {
  const mac = device.ports[0]?.mac
  if (mac === undefined) throw new Error(`${device.id} has no MAC`)
  return mac
}

/**
 * Flat office: internet — router (Gi0/0 192.168.1.1) — switch Fa0/1 (trunk).
 * pc1 static .20 (Fa0/2, DNS 8.8.8.8, AppLink "printerLink" to the printer), pc2 DHCP .101 (Fa0/3,
 * leased), printer static .150 (Fa0/4, no DNS).
 */
export function officeLab(): NetworkState {
  const pc2 = labHost('pc2', '192.168.1.101', { addressing: 'dhcp', gateway: '192.168.1.1', dns: ['192.168.1.1'] })
  return {
    devices: [
      named(labCloud('internet', { eth0: true }), 'İnternet'),
      gatewayRouter({ id: 'Gi0/0', ip: '192.168.1.1' }, [officePool('pool1', '192.168.1', [{ mac: macOf(pc2), ip: '192.168.1.101' }])]),
      named(labSwitch('switch', [trunkMode(), accessMode(1), accessMode(1), accessMode(1)]), 'Switch'),
      labHost('pc1', '192.168.1.20', {
        gateway: '192.168.1.1',
        dns: ['8.8.8.8'],
        appLinks: [{ id: 'printerLink', label: 'Yazıcı', targetIp: '192.168.1.150', targetKind: 'printer' }],
      }),
      pc2,
      labHost('printer', '192.168.1.150', { kind: 'printer', gateway: '192.168.1.1' }),
    ],
    links: [
      labLink('wan', ['internet', 'eth0'], ['router', 'Gi0/1']),
      labLink('uplink', ['router', 'Gi0/0'], ['switch', 'Fa0/1']),
      labLink('pc1Link', ['pc1', 'eth0'], ['switch', 'Fa0/2']),
      labLink('pc2Link', ['pc2', 'eth0'], ['switch', 'Fa0/3']),
      labLink('printerLink', ['printer', 'eth0'], ['switch', 'Fa0/4']),
    ],
  }
}

function accessPoint(): Device {
  const ports: Port[] = [
    { id: 'Gi0', medium: 'copper', role: 'switched', adminUp: true, mac: '02:00:00:AA:00:01', l2: trunkMode() },
    { id: 'Radio0', medium: 'wireless', role: 'radio', adminUp: true, mac: '02:00:00:AA:00:02' },
  ]
  return {
    id: 'ap',
    kind: 'accessPoint',
    modelId: 'accessPoint',
    name: 'AP',
    powered: true,
    baseMac: '02:00:00:AA:00:00',
    ports,
    wireless: {
      ssids: [
        { ssid: 'Isletme', vlan: 10, security: { mode: 'open' } },
        { ssid: 'Misafir', vlan: 20, security: { mode: 'open' } },
      ],
    },
  }
}

/**
 * Two VLANs on one switch, router-on-a-stick: Gi0/0.10 192.168.10.1 and Gi0/0.20 192.168.20.1.
 * kasa .10.20 (Fa0/2, VLAN 10, AppLink "kitchenLink" to the kitchen display), kitchen .10.30 (Fa0/3,
 * VLAN 10), AP on trunk Fa0/4 with SSIDs Isletme → 10 and Misafir → 20, guestPc .20.50 (Fa0/5,
 * VLAN 20), phone (smartphone, wlan0) DHCP on 'Misafir' (.20.101 leased).
 */
export function vlanLab(): NetworkState {
  const phone = labHost('phone', '192.168.20.101', {
    kind: 'smartphone',
    nic: { id: 'wlan0', medium: 'wireless' },
    addressing: 'dhcp',
    gateway: '192.168.20.1',
    dns: ['192.168.20.1'],
  })
  const lan = {
    id: 'Gi0/0',
    subInterfaces: [
      { vlan: 10, ip: '192.168.10.1' },
      { vlan: 20, ip: '192.168.20.1' },
    ],
  }
  return {
    devices: [
      named(labCloud('internet', { eth0: true }), 'İnternet'),
      gatewayRouter(lan, [officePool('pool10', '192.168.10'), officePool('pool20', '192.168.20', [{ mac: macOf(phone), ip: '192.168.20.101' }])]),
      named(labSwitch('switch', [trunkMode(), accessMode(10), accessMode(10), trunkMode(), accessMode(20)], [10, 20]), 'Switch'),
      accessPoint(),
      labHost('kasa', '192.168.10.20', {
        kind: 'pos',
        gateway: '192.168.10.1',
        dns: ['192.168.10.1'],
        appLinks: [{ id: 'kitchenLink', label: 'Mutfak ekranı', targetIp: '192.168.10.30', targetKind: 'kitchenDisplay' }],
      }),
      labHost('kitchen', '192.168.10.30', { kind: 'kitchenDisplay', gateway: '192.168.10.1' }),
      labHost('guestPc', '192.168.20.50', { gateway: '192.168.20.1', dns: ['192.168.20.1'] }),
      phone,
    ],
    links: [
      labLink('wan', ['internet', 'eth0'], ['router', 'Gi0/1']),
      labLink('uplink', ['router', 'Gi0/0'], ['switch', 'Fa0/1']),
      labLink('kasaLink', ['kasa', 'eth0'], ['switch', 'Fa0/2']),
      labLink('kitchenLink', ['kitchen', 'eth0'], ['switch', 'Fa0/3']),
      labLink('apLink', ['ap', 'Gi0'], ['switch', 'Fa0/4']),
      labLink('guestLink', ['guestPc', 'eth0'], ['switch', 'Fa0/5']),
      labLink('phoneLink', ['phone', 'wlan0'], ['ap', 'Radio0'], { cable: 'wireless', ssid: 'Misafir' }),
    ],
  }
}

/** Sets the address fields of a host's first NIC (eth0, or wlan0 on the phone). */
export function editNic(state: NetworkState, deviceId: string, patch: { addressing?: 'static' | 'dhcp'; address?: string; mask?: string }): NetworkState {
  return editDevice(state, deviceId, (device) => {
    const [nic, ...rest] = device.ports
    if (nic?.role !== 'host') throw new Error(`${deviceId} has no host NIC`)
    return { ...device, ports: [{ ...nic, l3: { ...nic.l3, ipv4: { ...nic.l3.ipv4, ...patch } } }, ...rest] }
  })
}

export function powerOff(state: NetworkState, deviceId: string): NetworkState {
  return editDevice(state, deviceId, (device) => ({ ...device, powered: false }))
}

export function unplug(state: NetworkState, linkId: string): NetworkState {
  return editLink(state, linkId, (link) => ({ ...link, connected: false }))
}

export function shutPort(state: NetworkState, deviceId: string, portId: string): NetworkState {
  return editPort(state, deviceId, portId, (port) => ({ ...port, adminUp: false }))
}

/** The ISP stops serving the router's WAN port (v1: `wanUp: false`). */
export function wanDown(state: NetworkState): NetworkState {
  return editDevice(state, 'internet', (cloud) => ({ ...cloud, internet: { handoffs: [{ portId: 'eth0', serviceUp: false }] } }))
}

/** Edits the services of the gateway router (DHCP pools, DNS forwarding). */
export function editRouterServices(state: NetworkState, change: (services: NonNullable<Device['services']>) => Device['services']): NetworkState {
  return editDevice(state, 'router', (router) => ({ ...router, services: change(router.services ?? {}) }))
}
