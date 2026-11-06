// Building blocks of the sample labs (docs/SAMPLE_LABS.md, SL2): device settings the design briefs'
// deviceSetup does not have (any mask, leases, trunk details, relay, DNS records), the step-check
// shorthands and `finishLab`, which turns a LabBuilder into a SampleLab with final hostnames.
// The labs themselves are built with the design briefs' LabBuilder (imported, not copied).
import type { AddressRange, Device, DhcpPool, DnsARecord, Port, StaticRoute, VlanEntry } from '../../domain'
import type { LabBuilder } from '../../scenarios/design/labBuilder'
import type { DeviceChange } from '../../scenarios/design/deviceSetup'
import type { SampleLab, StepCheck } from '../contract'

export const MASK_24 = '255.255.255.0'
export const MASK_30 = '255.255.255.252'

function changePort(device: Device, portId: string, change: (port: Port) => Port): Device {
  if (!device.ports.some((port) => port.id === portId)) throw new Error(`${device.id} has no port ${portId}`)
  return { ...device, ports: device.ports.map((port) => (port.id === portId ? change(port) : port)) }
}

function hostSettings(device: Device): NonNullable<Device['host']> {
  if (!device.host) throw new Error(`${device.id} is not an end device`)
  return device.host
}

/** A NIC with a static address (any mask), plus the host's gateway and DNS servers. */
export function staticNic(address: string, mask = MASK_24, gateway = '', dnsServers: readonly string[] = [], portId = 'eth0'): DeviceChange {
  return (device) => {
    const addressed = changePort(device, portId, (port) => {
      if (port.role !== 'host') throw new Error(`${device.id}/${portId} is not a NIC`)
      return { ...port, l3: { ...port.l3, ipv4: { addressing: 'static', address, mask } } }
    })
    return { ...addressed, host: { ...hostSettings(addressed), defaultGateway: gateway, dnsServers: [...dnsServers] } }
  }
}

/** A DHCP NIC that already holds a lease (the server side is `withLease`). */
export function leasedNic(address: string, gateway: string, dnsServers: readonly string[] = [], portId = 'eth0'): DeviceChange {
  return (device) => {
    const addressed = changePort(device, portId, (port) => {
      if (port.role !== 'host') throw new Error(`${device.id}/${portId} is not a NIC`)
      return { ...port, l3: { ...port.l3, ipv4: { addressing: 'dhcp', address, mask: MASK_24 } } }
    })
    return { ...addressed, host: { ...hostSettings(addressed), defaultGateway: gateway, dnsServers: [...dnsServers] } }
  }
}

/** Switched off (still cabled). */
export function poweredOff(): DeviceChange {
  return (device) => ({ ...device, powered: false })
}

/** A DHCP pool for any /24 network: `network` like '192.168.1.0', no allocation window (IOS style). */
export function pool(id: string, network: string, defaultRouter: string, dnsServers: readonly string[] = []): DhcpPool {
  return { id, network, mask: MASK_24, defaultRouter, dnsServers: [...dnsServers], leases: [] }
}

/** DHCP server with these pools and device-wide exclusions (`ip dhcp excluded-address`). */
export function dhcpService(pools: readonly DhcpPool[], excludedRanges: readonly AddressRange[] = []): DeviceChange {
  return (device) => ({
    ...device,
    services: { ...device.services, dhcp: { enabled: true, pools: pools.map((entry) => ({ ...entry, leases: [...entry.leases] })), excludedRanges: [...excludedRanges] } },
  })
}

/** Adds a binding (MAC → address) to a pool of the device's DHCP server. */
export function withLease(poolId: string, mac: string, ip: string): DeviceChange {
  return (device) => {
    const dhcp = device.services?.dhcp
    if (!dhcp?.pools.some((entry) => entry.id === poolId)) throw new Error(`${device.id} has no DHCP pool ${poolId}`)
    const pools = dhcp.pools.map((entry) => (entry.id === poolId ? { ...entry, leases: [...entry.leases, { mac, ip }] } : entry))
    return { ...device, services: { ...device.services, dhcp: { ...dhcp, pools } } }
  }
}

/** DNS service with A records and forwarders ([] = answer from the records only). */
export function dnsService(records: readonly (readonly [name: string, address: string])[], forwarders: readonly string[] = []): DeviceChange {
  const list: DnsARecord[] = records.map(([name, address]) => ({ type: 'A', name, address }))
  return (device) => ({ ...device, services: { ...device.services, dns: { enabled: true, forwarders: [...forwarders], records: list } } })
}

/** `ip helper-address` on a routed port. */
export function helperAddress(portId: string, addresses: readonly string[]): DeviceChange {
  return (device) =>
    changePort(device, portId, (port) => {
      if (port.role !== 'routed') throw new Error(`${device.id}/${portId} is not a routed port`)
      return { ...port, l3: { ...port.l3, helperAddresses: [...addresses] } }
    })
}

/** Trunk details: `switchport trunk native vlan` and `switchport trunk allowed vlan` (port already a trunk). */
export function trunkDetails(portId: string, nativeVlan: number, allowedVlans: 'all' | readonly number[] = 'all'): DeviceChange {
  return (device) =>
    changePort(device, portId, (port) => {
      if (port.role !== 'switched' || port.l2.mode !== 'trunk') throw new Error(`${device.id}/${portId} is not a trunk`)
      return { ...port, l2: { ...port.l2, nativeVlan, allowedVlans: allowedVlans === 'all' ? 'all' : [...allowedVlans] } }
    })
}

/** VLAN database entries with IOS-style names ('VLAN0010') unless a name is given. */
export function vlanEntries(ids: readonly number[], names: Readonly<Record<number, string>> = {}): VlanEntry[] {
  return ids.map((id) => ({ id, name: names[id] ?? `VLAN${String(id).padStart(4, '0')}` }))
}

/** `ip routing` on or off (an L3 switch starts with it off). */
export function ipRouting(on: boolean, staticRoutes: readonly StaticRoute[] = []): DeviceChange {
  return (device) => ({ ...device, routing: { ...device.routing, ipRouting: on, staticRoutes: [...staticRoutes] } })
}

/** Base MAC of a device already added to the builder (end devices: the MAC of eth0). */
export function macOf(lab: LabBuilder, deviceId: string): string {
  const device = lab.state().devices.find((candidate) => candidate.id === deviceId)
  if (!device) throw new Error(`No device ${deviceId}`)
  return device.baseMac
}

/**
 * The builder's lab as a SampleLab with final, language-neutral hostnames: `names[id]` or the id in
 * capitals (pc1 → PC1, sw1 → SW1, r1 → R1).
 */
export function finishLab(lab: LabBuilder, names: Readonly<Record<string, string>> = {}): SampleLab {
  const built = lab.build()
  const devices = built.state.devices.map((device) => ({ ...device, name: names[device.id] ?? device.id.toUpperCase() }))
  return { state: { ...built.state, devices }, layout: built.layout }
}

/** The lab with these cables unplugged (still in place, link light off). */
export function withUnplugged(lab: SampleLab, linkIds: readonly string[]): SampleLab {
  for (const id of linkIds) if (!lab.state.links.some((link) => link.id === id)) throw new Error(`No link ${id}`)
  const links = lab.state.links.map((link) => (linkIds.includes(link.id) ? { ...link, connected: false } : link))
  return { ...lab, state: { ...lab.state, links } }
}

// Step-check shorthands -------------------------------------------------------------------------

export function reaches(fromDeviceId: string, toDeviceId: string): StepCheck {
  return { type: 'solve', condition: { type: 'reachable', fromDeviceId, toDeviceId } }
}

export function resolves(fromDeviceId: string, name: string): StepCheck {
  return { type: 'solve', condition: { type: 'resolves', fromDeviceId, name } }
}

export function online(fromDeviceId: string): StepCheck {
  return { type: 'solve', condition: { type: 'internet', fromDeviceId } }
}

export function hasAddress(deviceId: string, prefix?: string): StepCheck {
  return prefix === undefined ? { type: 'hasAddress', deviceId } : { type: 'hasAddress', deviceId, prefix }
}

export function not(check: StepCheck): StepCheck {
  return { type: 'not', check }
}
