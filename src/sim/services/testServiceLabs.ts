// Test-only labs of the services layer tests (built from the engine's test builders).
import type { Device, DhcpPool, DnsServerSettings, NetworkState, Port, StaticRoute } from '../../domain'
import { labCloud, labHost, labLink, labRouter } from '../../engine/testLabs'

const CROSS = { cable: 'copperCross' } as const
const MASK = '255.255.255.0'

/** Pool `<base>.0/24`, gateway and DNS `<base>.1`; optional range and leases. */
export function pool(id: string, base: string, extra: Partial<DhcpPool> = {}): DhcpPool {
  return { id, network: `${base}.0`, mask: MASK, defaultRouter: `${base}.1`, dnsServers: [`${base}.1`], leases: [], ...extra }
}

export function withDhcp(device: Device, pools: DhcpPool[], excludedRanges: Array<{ start: string; end: string }> = []): Device {
  return { ...device, services: { ...device.services, dhcp: { enabled: true, pools, excludedRanges } } }
}

export function withDns(device: Device, dns: Partial<DnsServerSettings>): Device {
  return { ...device, services: { ...device.services, dns: { enabled: true, forwarders: [], records: [], ...dns } } }
}

function hub(id: string, portCount: number): Device {
  const ports: Port[] = Array.from({ length: portCount }, (_, index) => ({ id: `p${index + 1}`, medium: 'copper', role: 'passive', adminUp: true }))
  return { id, kind: 'hub', modelId: 'hub', name: id, powered: true, baseMac: '02:00:00:FF:0F:00', ports }
}

/** pc (DHCP, no address) — r Gi0/0 192.168.1.1 serving pool LAN. */
export function dhcpLab(dhcpPool: DhcpPool = pool('LAN', '192.168.1'), excludedRanges: Array<{ start: string; end: string }> = []): NetworkState {
  return {
    devices: [labHost('pc', '', { addressing: 'dhcp' }), withDhcp(labRouter('r', [{ id: 'Gi0/0', ip: '192.168.1.1' }]), [dhcpPool], excludedRanges)],
    links: [labLink('l1', ['pc', 'eth0'], ['r', 'Gi0/0'], CROSS)],
  }
}

/** pc1, pc2 (DHCP) and the given routers on one hub (hub ports p1…). */
export function hubLab(routers: Device[]): NetworkState {
  const devices = [labHost('pc1', '', { addressing: 'dhcp' }), labHost('pc2', '', { addressing: 'dhcp' }), ...routers]
  const links = devices.map((device, index) => labLink(`l${index + 1}`, [device.id, device.ports[0]?.id ?? ''], ['hub', `p${index + 1}`]))
  return { devices: [...devices, hub('hub', devices.length)], links }
}

/** pc (DHCP) — relay r1 (Gi0/0 192.168.10.1, helper 10.0.0.2; Gi0/1 10.0.0.1) — server r2 (Gi0/0 10.0.0.2). */
export function relayLab(): NetworkState {
  const r1 = labRouter('r1', [{ id: 'Gi0/0', ip: '192.168.10.1' }, { id: 'Gi0/1', ip: '10.0.0.1' }])
  const relay: Device = {
    ...r1,
    ports: r1.ports.map((port) => (port.id === 'Gi0/0' && port.role === 'routed' ? { ...port, l3: { ...port.l3, helperAddresses: ['10.0.0.2'] } } : port)),
  }
  const back: StaticRoute = { prefix: '192.168.10.0', mask: MASK, nextHop: '10.0.0.1', adminDistance: 1 }
  const server = withDhcp(labRouter('r2', [{ id: 'Gi0/0', ip: '10.0.0.2' }], [back]), [pool('VLAN10', '192.168.10'), pool('OTHER', '10.0.0')])
  return {
    devices: [labHost('pc', '', { addressing: 'dhcp' }), relay, server],
    links: [labLink('l1', ['pc', 'eth0'], ['r1', 'Gi0/0'], CROSS), labLink('l2', ['r1', 'Gi0/1'], ['r2', 'Gi0/0'], CROSS)],
  }
}

const DEFAULT_WAN: StaticRoute = { prefix: '0.0.0.0', mask: '0.0.0.0', exitInterfaceId: 'Gi0/1', adminDistance: 1 }

/**
 * pc 192.168.1.10 (DNS r1) and a printer 192.168.1.50 on a hub with r1 (Gi0/0 192.168.1.1,
 * Gi0/1 10.0.0.1) — r2 (Gi0/0 10.0.0.2, WAN Gi0/1) — cloud.
 * r1 and r2 run DNS with the given settings; r1's default route goes to r2, r2's out of the WAN.
 */
export function dnsLab(r1Dns: Partial<DnsServerSettings>, r2Dns: Partial<DnsServerSettings>, pcDns: string[] = ['192.168.1.1']): NetworkState {
  const toR2: StaticRoute = { prefix: '0.0.0.0', mask: '0.0.0.0', nextHop: '10.0.0.2', adminDistance: 1 }
  const back: StaticRoute = { prefix: '192.168.1.0', mask: MASK, nextHop: '10.0.0.1', adminDistance: 1 }
  return {
    devices: [
      labHost('pc', '192.168.1.10', { gateway: '192.168.1.1', dns: pcDns }),
      withDns(labRouter('r1', [{ id: 'Gi0/0', ip: '192.168.1.1' }, { id: 'Gi0/1', ip: '10.0.0.1' }], [toR2]), r1Dns),
      withDns(labRouter('r2', [{ id: 'Gi0/0', ip: '10.0.0.2' }, { id: 'Gi0/1', addressing: 'dhcp' }], [back, DEFAULT_WAN]), r2Dns),
      labCloud('internet', { eth0: true }),
      labHost('printer', '192.168.1.50', { kind: 'printer', gateway: '192.168.1.1' }),
      hub('hub', 3),
    ],
    links: [
      labLink('l1', ['pc', 'eth0'], ['hub', 'p1']),
      labLink('l2', ['r1', 'Gi0/0'], ['hub', 'p2']),
      labLink('l3', ['printer', 'eth0'], ['hub', 'p3']),
      labLink('l4', ['r1', 'Gi0/1'], ['r2', 'Gi0/0'], CROSS),
      labLink('wan', ['internet', 'eth0'], ['r2', 'Gi0/1']),
    ],
  }
}

/** pc 192.168.1.10 (gateway r) — r (Gi0/0 192.168.1.1, WAN Gi0/1) — cloud. */
export function webLab(gateway = '192.168.1.1'): NetworkState {
  return {
    devices: [
      labHost('pc', '192.168.1.10', { gateway, dns: ['8.8.8.8'] }),
      labRouter('r', [{ id: 'Gi0/0', ip: '192.168.1.1' }, { id: 'Gi0/1', addressing: 'dhcp' }], [DEFAULT_WAN]),
      labCloud('internet', { eth0: true }),
    ],
    links: [labLink('l1', ['pc', 'eth0'], ['r', 'Gi0/0'], CROSS), labLink('wan', ['internet', 'eth0'], ['r', 'Gi0/1'])],
  }
}
