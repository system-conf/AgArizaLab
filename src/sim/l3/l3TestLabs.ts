// Test-only labs of the network layer tests.
import type { Device, NetworkState, StaticRoute, Svi } from '../../domain'
import { accessMode, labCloud, labHost, labLink, labRouter, labSwitch, trunkMode } from '../../engine/testLabs'
import type { SimPingRequest, SimTracertRequest } from '../contract'

const MASK = '255.255.255.0'

export function staticRoute(prefix: string, mask: string, nextHop: string, adminDistance = 1): StaticRoute {
  return { prefix, mask, nextHop, adminDistance }
}

/**
 * pc1 10.0.1.10 — sw1 — r1 Gi0/0 10.0.1.1 | r1 Gi0/1 10.0.12.1 — r2 Gi0/1 10.0.12.2 | r2 Gi0/0 10.0.2.1 — pc2 10.0.2.10.
 * Static routes r1: 10.0.2.0/24 via 10.0.12.2; r2: 10.0.1.0/24 via 10.0.12.1 (or the given ones).
 */
export function twoRouterLab(routes: { r1?: StaticRoute[]; r2?: StaticRoute[] } = {}): NetworkState {
  return {
    devices: [
      labHost('pc1', '10.0.1.10', { gateway: '10.0.1.1' }),
      labSwitch('sw1', [accessMode(1), accessMode(1)]),
      labRouter('r1', [{ id: 'Gi0/0', ip: '10.0.1.1' }, { id: 'Gi0/1', ip: '10.0.12.1' }], routes.r1 ?? [staticRoute('10.0.2.0', MASK, '10.0.12.2')]),
      labRouter('r2', [{ id: 'Gi0/0', ip: '10.0.2.1' }, { id: 'Gi0/1', ip: '10.0.12.2' }], routes.r2 ?? [staticRoute('10.0.1.0', MASK, '10.0.12.1')]),
      labHost('pc2', '10.0.2.10', { gateway: '10.0.2.1' }),
    ],
    links: [
      labLink('l1', ['pc1', 'eth0'], ['sw1', 'Fa0/1']),
      labLink('l2', ['sw1', 'Fa0/2'], ['r1', 'Gi0/0']),
      labLink('l3', ['r1', 'Gi0/1'], ['r2', 'Gi0/1']),
      labLink('l4', ['r2', 'Gi0/0'], ['pc2', 'eth0']),
    ],
  }
}

/** pc 192.168.1.20 — sw — router Gi0/0 192.168.1.1, Gi0/1 (DHCP, no address) — cloud eth0; default route out of Gi0/1. */
export function internetLab(options: { serviceUp?: boolean; defaultRoute?: boolean } = {}): NetworkState {
  const routes: StaticRoute[] = options.defaultRoute === false ? [] : [{ prefix: '0.0.0.0', mask: '0.0.0.0', exitInterfaceId: 'Gi0/1', adminDistance: 1 }]
  return {
    devices: [
      labHost('pc', '192.168.1.20', { gateway: '192.168.1.1' }),
      labSwitch('sw', [accessMode(1), accessMode(1)]),
      labRouter('router', [{ id: 'Gi0/0', ip: '192.168.1.1' }, { id: 'Gi0/1', addressing: 'dhcp' }], routes),
      labCloud('internet', { eth0: options.serviceUp ?? true }),
    ],
    links: [
      labLink('l1', ['pc', 'eth0'], ['sw', 'Fa0/1']),
      labLink('l2', ['sw', 'Fa0/2'], ['router', 'Gi0/0']),
      labLink('wan', ['router', 'Gi0/1'], ['internet', 'eth0']),
    ],
  }
}

/** Router-on-a-stick: router Gi0/0.10 192.168.10.1 / Gi0/0.20 192.168.20.1 on a trunk; pc10 / pc20 on access ports. */
export function stickLab(): NetworkState {
  return {
    devices: [
      labRouter('router', [{ id: 'Gi0/0', subInterfaces: [{ vlan: 10, ip: '192.168.10.1' }, { vlan: 20, ip: '192.168.20.1' }] }]),
      labSwitch('sw', [trunkMode(), accessMode(10), accessMode(20)], [10, 20]),
      labHost('pc10', '192.168.10.10', { gateway: '192.168.10.1' }),
      labHost('pc20', '192.168.20.10', { gateway: '192.168.20.1' }),
    ],
    links: [
      labLink('trunk', ['router', 'Gi0/0'], ['sw', 'Fa0/1']),
      labLink('l10', ['pc10', 'eth0'], ['sw', 'Fa0/2']),
      labLink('l20', ['pc20', 'eth0'], ['sw', 'Fa0/3']),
    ],
  }
}

function svi(vlan: number, address: string): Svi {
  return { vlan, adminUp: true, l3: { ipv4: { addressing: 'static', address, mask: MASK } } }
}

/** L3 switch with `ip routing`, SVIs Vlan10 192.168.10.1 / Vlan20 192.168.20.1; pc10 / pc20 on access ports. */
export function l3SwitchLab(): NetworkState {
  const base = labSwitch('core', [accessMode(10), accessMode(20)], [10, 20], 'l3Switch')
  const core: Device = {
    ...base,
    switching: { vlans: base.switching?.vlans ?? [], svis: [svi(10, '192.168.10.1'), svi(20, '192.168.20.1')], defaultGateway: '' },
    routing: { ipRouting: true, staticRoutes: [] },
  }
  return {
    devices: [core, labHost('pc10', '192.168.10.10', { gateway: '192.168.10.1' }), labHost('pc20', '192.168.20.10', { gateway: '192.168.20.1' })],
    links: [labLink('l10', ['pc10', 'eth0'], ['core', 'Fa0/1']), labLink('l20', ['pc20', 'eth0'], ['core', 'Fa0/2'])],
  }
}

export function ping(deviceId: string, targetIp: string, count = 1): SimPingRequest {
  return { kind: 'ping', deviceId, targetIp, count, size: 32 }
}

export function tracert(deviceId: string, targetIp: string): SimTracertRequest {
  return { kind: 'tracert', deviceId, targetIp, maxHops: 30, probesPerHop: 3, maxSilentHops: 4 }
}
