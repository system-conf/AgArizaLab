// Test-only builders and immutable edit helpers for small v2 labs (engine tests).
import type {
  DeviceKindV2,
  DeviceV2,
  HostSettings,
  LinkCable,
  LinkV2,
  NetworkStateV2,
  Port,
  StaticRoute,
  SubInterface,
  SwitchportSettings,
} from '../../domain/v2'

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
  kind?: DeviceKindV2
  mask?: string
  gateway?: string
  dns?: string[]
  addressing?: 'static' | 'dhcp'
  nic?: { id: string; medium: 'copper' | 'wireless' }
  appLinks?: HostSettings['appLinks']
}

/** An end device with one NIC (default eth0, copper, static). */
export function hostV2(id: string, ip: string, options: HostOptions = {}): DeviceV2 {
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

export function routedPortV2(spec: RoutedPortSpec): Port {
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
export function routerV2(id: string, ports: RoutedPortSpec[], staticRoutes: StaticRoute[] = []): DeviceV2 {
  return {
    id,
    kind: 'router',
    modelId: 'router2Port',
    name: id,
    powered: true,
    baseMac: nextMac(),
    ports: ports.map((spec) => routedPortV2(spec)),
    routing: { ipRouting: true, staticRoutes },
  }
}

export function accessV2(vlan: number): SwitchportSettings {
  return { mode: 'access', accessVlan: vlan, nativeVlan: 1, allowedVlans: 'all' }
}

export function trunkV2(nativeVlan = 1, allowedVlans: SwitchportSettings['allowedVlans'] = 'all'): SwitchportSettings {
  return { mode: 'trunk', accessVlan: 1, nativeVlan, allowedVlans }
}

/** A switch with switchports `Fa0/1…` (in the given order) and a VLAN database. */
export function switchV2(id: string, ports: SwitchportSettings[], vlans: number[] = [1], kind: 'switch' | 'l3Switch' = 'switch'): DeviceV2 {
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
export function cloudV2(id = 'internet', serviceUp: Record<string, boolean> = {}): DeviceV2 {
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

export function linkV2(id: string, a: [string, string], b: [string, string], cable: LinkCable = { cable: 'copperStraight' }): LinkV2 {
  return { id, a: { deviceId: a[0], portId: a[1] }, b: { deviceId: b[0], portId: b[1] }, connected: true, ...cable }
}

export function deviceV2(state: NetworkStateV2, id: string): DeviceV2 {
  const device = state.devices.find((candidate) => candidate.id === id)
  if (!device) throw new Error(`Lab has no device ${id}`)
  return device
}

export function editDevice(state: NetworkStateV2, id: string, change: (device: DeviceV2) => DeviceV2): NetworkStateV2 {
  deviceV2(state, id)
  return { ...state, devices: state.devices.map((device) => (device.id === id ? change(device) : device)) }
}

export function editPort(state: NetworkStateV2, deviceId: string, portId: string, change: (port: Port) => Port): NetworkStateV2 {
  return editDevice(state, deviceId, (device) => {
    if (!device.ports.some((port) => port.id === portId)) throw new Error(`${deviceId} has no port ${portId}`)
    return { ...device, ports: device.ports.map((port) => (port.id === portId ? change(port) : port)) }
  })
}

export function editHost(state: NetworkStateV2, deviceId: string, patch: Partial<HostSettings>): NetworkStateV2 {
  return editDevice(state, deviceId, (device) => {
    if (!device.host) throw new Error(`${deviceId} has no host settings`)
    return { ...device, host: { ...device.host, ...patch } }
  })
}

/** Sets the IPv4 settings of a host NIC or routed port. */
export function editAddress(
  state: NetworkStateV2,
  deviceId: string,
  portId: string,
  patch: { addressing?: 'static' | 'dhcp'; address?: string; mask?: string },
): NetworkStateV2 {
  return editPort(state, deviceId, portId, (port) => {
    if (port.role !== 'host' && port.role !== 'routed') throw new Error(`${deviceId}/${portId} has no l3`)
    return { ...port, l3: { ...port.l3, ipv4: { ...port.l3.ipv4, ...patch } } }
  })
}

export function editSwitchport(state: NetworkStateV2, deviceId: string, portId: string, patch: Partial<SwitchportSettings>): NetworkStateV2 {
  return editPort(state, deviceId, portId, (port) => {
    if (port.role !== 'switched') throw new Error(`${deviceId}/${portId} is not a switchport`)
    return { ...port, l2: { ...port.l2, ...patch } }
  })
}

export function editLink(state: NetworkStateV2, linkId: string, change: (link: LinkV2) => LinkV2): NetworkStateV2 {
  if (!state.links.some((link) => link.id === linkId)) throw new Error(`Lab has no link ${linkId}`)
  return { ...state, links: state.links.map((link) => (link.id === linkId ? change(link) : link)) }
}

export function textOf(lines: ReadonlyArray<{ text?: string }>): string[] {
  return lines.map((line) => line.text ?? '')
}
