// Test-only builders for small states (CableRules / StateInvariants tests).
import type { Device, DeviceKind } from './DeviceTypes'
import type { Link } from './LinkTypes'
import type { NetworkState } from './NetworkState'
import type { L3Settings, Port } from './PortTypes'

const NO_ADDRESS: L3Settings = { ipv4: { addressing: 'dhcp', address: '', mask: '' } }

let macCounter = 0
function nextMac(): string {
  macCounter += 1
  const hex = macCounter.toString(16).toUpperCase().padStart(4, '0')
  return `AA:BB:CC:00:${hex.slice(0, 2)}:${hex.slice(2, 4)}`
}

export function hostNic(id: string, medium: 'copper' | 'wireless' = 'copper'): Port {
  return { id, medium, role: 'host', adminUp: true, mac: nextMac(), l3: NO_ADDRESS }
}

export function switchPort(id: string, medium: 'copper' | 'fiber' = 'copper'): Port {
  return {
    id,
    medium,
    role: 'switched',
    adminUp: true,
    mac: nextMac(),
    l2: { mode: 'access', accessVlan: 1, nativeVlan: 1, allowedVlans: 'all' },
  }
}

export function routedPort(id: string, medium: 'copper' | 'serial' = 'copper'): Port {
  const mac = medium === 'serial' ? {} : { mac: nextMac() }
  return { id, medium, role: 'routed', adminUp: true, ...mac, l3: NO_ADDRESS, subInterfaces: [] }
}

export function consolePort(id = 'Console'): Port {
  return { id, medium: 'console', role: 'console', adminUp: true }
}

export function makeDevice(id: string, kind: DeviceKind, ports: Port[]): Device {
  return { id, kind, modelId: kind, name: id, powered: true, baseMac: nextMac(), ports }
}

/**
 * pc (eth0, wlan0, RS232) · laptop (wlan0) · sw / sw2 (Fa0/1, Fa0/2 copper, Gi0/1 fiber, Console)
 * router / router2 (Gi0/0 copper, Se0/0/0 serial, Console) · ap (Gi0 copper, Radio0 radio, SSID 'Office')
 * cloud (coax0 coaxial). No links.
 */
export function cableLab(): NetworkState {
  const ap = makeDevice('ap', 'accessPoint', [
    switchPort('Gi0'),
    { id: 'Radio0', medium: 'wireless', role: 'radio', adminUp: true, mac: nextMac() },
  ])
  return {
    devices: [
      makeDevice('pc', 'pc', [hostNic('eth0'), hostNic('wlan0', 'wireless'), consolePort('RS232')]),
      makeDevice('laptop', 'laptop', [hostNic('wlan0', 'wireless')]),
      makeDevice('sw', 'switch', [switchPort('Fa0/1'), switchPort('Fa0/2'), switchPort('Gi0/1', 'fiber'), consolePort()]),
      makeDevice('sw2', 'switch', [switchPort('Fa0/1'), switchPort('Fa0/2'), switchPort('Gi0/1', 'fiber'), consolePort()]),
      makeDevice('router', 'router', [routedPort('Gi0/0'), routedPort('Se0/0/0', 'serial'), consolePort()]),
      makeDevice('router2', 'router', [routedPort('Gi0/0'), routedPort('Se0/0/0', 'serial'), consolePort()]),
      { ...ap, wireless: { ssids: [{ ssid: 'Office', vlan: 1, security: { mode: 'open' } }] } },
      makeDevice('cloud', 'internet', [{ id: 'coax0', medium: 'coaxial', role: 'passive', adminUp: true, mac: nextMac() }]),
    ],
    links: [],
  }
}

export function withLinks(state: NetworkState, links: Link[]): NetworkState {
  return { ...state, links: [...state.links, ...links] }
}

/** Replaces one port of one device (e.g. to turn auto-MDIX off). */
export function updatePort(state: NetworkState, deviceId: string, portId: string, change: (port: Port) => Port): NetworkState {
  return {
    ...state,
    devices: state.devices.map((device) =>
      device.id === deviceId
        ? { ...device, ports: device.ports.map((port) => (port.id === portId ? change(port) : port)) }
        : device,
    ),
  }
}
