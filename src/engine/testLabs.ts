// Test-only builders and immutable edit helpers for small labs (engine tests).
import type {
  Device,
  DeviceKind,
  HostSettings,
  Link,
  LinkCable,
  NetworkState,
  Port,
  StaticRoute,
  SubInterface,
  SwitchportSettings,
} from '../domain'

let macCounter = 0
function nextMac(): string {
  macCounter += 1
  const hex = macCounter.toString(16).toUpperCase().padStart(4, '0')
  return `02:00:00:00:${hex.slice(0, 2)}:${hex.slice(2, 4)}`
}

function l3(address: string, mask: string, addressing: 'static' | 'dhcp' = 'static') {
  return { ipv4: { addressing, address, mask } }
}

const MASK = '255.255.255.0'

export interface HostOptions {
  kind?: DeviceKind
  mask?: string
  gateway?: string
  dns?: string[]
  addressing?: 'static' | 'dhcp'
  nic?: { id: string; medium: 'copper' | 'wireless' }
  appLinks?: HostSettings['appLinks']
}

/** An end device with one NIC (default eth0, copper, static). */
export function labHost(id: string, ip: string, options: HostOptions = {}): Device {
  const nic = options.nic ?? { id: 'eth0', medium: 'copper' }
  const mac = nextMac()
  return {
    id,
    kind: options.kind ?? 'pc',
    modelId: options.kind ?? 'pc',
    name: id,
    powered: true,
    baseMac: mac,
    ports: [{ id: nic.id, medium: nic.medium, role: 'host', adminUp: true, mac, l3: l3(ip, ip === '' ? '' : (options.mask ?? MASK), options.addressing) }],
    host: { defaultGateway: options.gateway ?? '', dnsServers: options.dns ?? [], appLinks: options.appLinks ?? [] },
  }
}

export interface RoutedPortSpec {
  id: string
  ip?: string
  mask?: string
  subInterfaces?: Array<{ vlan: number; ip: string; mask?: string; native?: boolean; adminUp?: boolean }>
  addressing?: 'static' | 'dhcp'
}

export function labRoutedPort(spec: RoutedPortSpec): Port {
  const subInterfaces: SubInterface[] = (spec.subInterfaces ?? []).map((sub) => ({
    id: `${spec.id}.${sub.vlan}`,
    vlan: sub.vlan,
    ...(sub.native ? { native: true } : {}),
    adminUp: sub.adminUp ?? true,
    l3: l3(sub.ip, sub.mask ?? MASK),
  }))
  const ip = spec.ip ?? ''
  return {
    id: spec.id,
    medium: 'copper',
    role: 'routed',
    adminUp: true,
    mac: nextMac(),
    l3: l3(ip, ip === '' ? '' : (spec.mask ?? MASK), spec.addressing),
    subInterfaces,
  }
}

/** A router with ip routing, the given routed ports and static routes. */
export function labRouter(id: string, ports: RoutedPortSpec[], staticRoutes: StaticRoute[] = []): Device {
  return {
    id,
    kind: 'router',
    modelId: 'router2Port',
    name: id,
    powered: true,
    baseMac: nextMac(),
    ports: ports.map((spec) => labRoutedPort(spec)),
    routing: { ipRouting: true, staticRoutes },
  }
}

export function accessMode(vlan: number): SwitchportSettings {
  return { mode: 'access', accessVlan: vlan, nativeVlan: 1, allowedVlans: 'all' }
}

export function trunkMode(nativeVlan = 1, allowedVlans: SwitchportSettings['allowedVlans'] = 'all'): SwitchportSettings {
  return { mode: 'trunk', accessVlan: 1, nativeVlan, allowedVlans }
}

/** A switch with switchports `Fa0/1…` (in the given order) and a VLAN database. */
export function labSwitch(id: string, ports: SwitchportSettings[], vlans: number[] = [1], kind: 'switch' | 'l3Switch' = 'switch'): Device {
  return {
    id,
    kind,
    modelId: kind === 'switch' ? 'switch8' : 'l3Switch',
    name: id,
    powered: true,
    baseMac: nextMac(),
    ports: ports.map((l2, index) => ({ id: `Fa0/${index + 1}`, medium: 'copper', role: 'switched', adminUp: true, mac: nextMac(), l2 })),
    switching: {
      vlans: [...new Set([1, ...vlans])].sort((a, b) => a - b).map((vlan) => ({ id: vlan, name: vlan === 1 ? 'default' : `VLAN${vlan}` })),
      svis: [],
      defaultGateway: '',
    },
  }
}

/** The ISP cloud with ports eth0…eth3; `serviceUp` per port (absent = up). */
export function labCloud(id = 'internet', serviceUp: Record<string, boolean> = {}): Device {
  return {
    id,
    kind: 'internet',
    modelId: 'internetCloud',
    name: id,
    powered: true,
    baseMac: nextMac(),
    ports: ['eth0', 'eth1', 'eth2', 'eth3'].map((portId) => ({ id: portId, medium: 'copper', role: 'passive', adminUp: true, mac: nextMac() })),
    internet: { handoffs: Object.entries(serviceUp).map(([portId, up]) => ({ portId, serviceUp: up })) },
  }
}

export function labLink(id: string, a: [string, string], b: [string, string], cable: LinkCable = { cable: 'copperStraight' }): Link {
  return { id, a: { deviceId: a[0], portId: a[1] }, b: { deviceId: b[0], portId: b[1] }, connected: true, ...cable }
}

export function labDevice(state: NetworkState, id: string): Device {
  const device = state.devices.find((candidate) => candidate.id === id)
  if (!device) throw new Error(`Lab has no device ${id}`)
  return device
}

export function editDevice(state: NetworkState, id: string, change: (device: Device) => Device): NetworkState {
  labDevice(state, id)
  return { ...state, devices: state.devices.map((device) => (device.id === id ? change(device) : device)) }
}

export function editPort(state: NetworkState, deviceId: string, portId: string, change: (port: Port) => Port): NetworkState {
  return editDevice(state, deviceId, (device) => {
    if (!device.ports.some((port) => port.id === portId)) throw new Error(`${deviceId} has no port ${portId}`)
    return { ...device, ports: device.ports.map((port) => (port.id === portId ? change(port) : port)) }
  })
}

export function editHost(state: NetworkState, deviceId: string, patch: Partial<HostSettings>): NetworkState {
  return editDevice(state, deviceId, (device) => {
    if (!device.host) throw new Error(`${deviceId} has no host settings`)
    return { ...device, host: { ...device.host, ...patch } }
  })
}

/** Sets the IPv4 settings of a host NIC or routed port. */
export function editAddress(
  state: NetworkState,
  deviceId: string,
  portId: string,
  patch: { addressing?: 'static' | 'dhcp'; address?: string; mask?: string },
): NetworkState {
  return editPort(state, deviceId, portId, (port) => {
    if (port.role !== 'host' && port.role !== 'routed') throw new Error(`${deviceId}/${portId} has no l3`)
    return { ...port, l3: { ...port.l3, ipv4: { ...port.l3.ipv4, ...patch } } }
  })
}

export function editSwitchport(state: NetworkState, deviceId: string, portId: string, patch: Partial<SwitchportSettings>): NetworkState {
  return editPort(state, deviceId, portId, (port) => {
    if (port.role !== 'switched') throw new Error(`${deviceId}/${portId} is not a switchport`)
    return { ...port, l2: { ...port.l2, ...patch } }
  })
}

export function editLink(state: NetworkState, linkId: string, change: (link: Link) => Link): NetworkState {
  if (!state.links.some((link) => link.id === linkId)) throw new Error(`Lab has no link ${linkId}`)
  return { ...state, links: state.links.map((link) => (link.id === linkId ? change(link) : link)) }
}

export function textOf(lines: ReadonlyArray<{ text?: string }>): string[] {
  return lines.map((line) => line.text ?? '')
}
