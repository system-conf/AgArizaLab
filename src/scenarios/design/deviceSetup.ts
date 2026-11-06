// Small, composable device settings for the design briefs' labs (the reference designs and the few
// pre-configured customer devices). Each helper returns a DeviceChange; LabBuilder applies them in
// order. They throw on a wrong port id so a typo in brief data fails the tests, not the learner.
import type { Device, DhcpPool, Port, RoutedPort, StaticRoute, VlanEntry } from '../../domain'

export type DeviceChange = (device: Device) => Device

export const MASK_24 = '255.255.255.0'
export const MASK_30 = '255.255.255.252'
/** Public resolver handed out by DHCP where the gateway runs no DNS proxy. */
export const PUBLIC_DNS = '8.8.8.8'

function changePort(device: Device, portId: string, change: (port: Port) => Port): Device {
  if (!device.ports.some((port) => port.id === portId)) throw new Error(`${device.id} has no port ${portId}`)
  return { ...device, ports: device.ports.map((port) => (port.id === portId ? change(port) : port)) }
}

function routed(port: Port, address: string, mask: string, addressing: 'static' | 'dhcp' = 'static'): RoutedPort {
  if (port.role !== 'routed' && port.role !== 'switched') throw new Error(`${port.id} cannot be a routed port`)
  const ipv4 = { addressing, address, mask }
  if (port.role === 'routed') return { ...port, adminUp: true, l3: { ...port.l3, ipv4 } }
  // `no switchport` on an L3 switch: same physical port, layer-3 settings instead of layer-2 ones.
  return {
    id: port.id,
    medium: port.medium,
    ...(port.mac === undefined ? {} : { mac: port.mac }),
    adminUp: true,
    role: 'routed',
    l3: { ipv4 },
    subInterfaces: [],
  }
}

/** Static address, gateway and DNS of an end device's NIC. */
export function staticHost(address: string, gateway: string, dnsServers: readonly string[], portId = 'eth0'): DeviceChange {
  return (device) => {
    const addressed = changePort(device, portId, (port) => {
      if (port.role !== 'host') throw new Error(`${device.id}/${portId} is not a NIC`)
      return { ...port, l3: { ...port.l3, ipv4: { addressing: 'static', address, mask: MASK_24 } } }
    })
    if (!addressed.host) throw new Error(`${device.id} is not an end device`)
    return { ...addressed, host: { ...addressed.host, defaultGateway: gateway, dnsServers: [...dnsServers] } }
  }
}

/** A routed interface with a static address (`no shutdown`); on an L3 switch also `no switchport`. */
export function routedPort(portId: string, address: string, mask = MASK_24): DeviceChange {
  return (device) => changePort(device, portId, (port) => routed(port, address, mask))
}

/** WAN interface towards the ISP: `ip address dhcp`, `no shutdown`. */
export function wanPort(portId: string): DeviceChange {
  return (device) => changePort(device, portId, (port) => routed(port, '', '', 'dhcp'))
}

/** Router-on-a-stick: the port up without an address, one dot1Q sub-interface per VLAN. */
export function subInterfaces(portId: string, list: readonly { vlan: number; address: string }[]): DeviceChange {
  return (device) =>
    changePort(device, portId, (port) => ({
      ...routed(port, '', ''),
      l3: { ipv4: { addressing: 'static', address: '', mask: '' } },
      subInterfaces: list.map(({ vlan, address }) => ({
        id: `${portId}.${vlan}`,
        vlan,
        adminUp: true,
        l3: { ipv4: { addressing: 'static', address, mask: MASK_24 } },
      })),
    }))
}

/** VLAN database: VLAN 1 plus the given VLANs (sorted). */
export function vlans(entries: readonly VlanEntry[]): DeviceChange {
  return (device) => {
    if (!device.switching) throw new Error(`${device.id} has no VLAN database`)
    const database = [{ id: 1, name: 'default' }, ...entries.filter((entry) => entry.id !== 1)].sort((a, b) => a.id - b.id)
    return { ...device, switching: { ...device.switching, vlans: database } }
  }
}

function switchports(portIds: readonly string[], change: (port: Port) => Port): DeviceChange {
  return (device) => portIds.reduce((current, portId) => changePort(current, portId, change), device)
}

/** `switchport mode access` + `switchport access vlan <vlan>`. */
export function accessPorts(portIds: readonly string[], vlan: number): DeviceChange {
  return switchports(portIds, (port) => {
    if (port.role !== 'switched') throw new Error(`${port.id} is not a switchport`)
    return { ...port, l2: { ...port.l2, mode: 'access', accessVlan: vlan } }
  })
}

/** `switchport mode trunk` carrying every VLAN of the database. */
export function trunkPorts(portIds: readonly string[]): DeviceChange {
  return switchports(portIds, (port) => {
    if (port.role !== 'switched') throw new Error(`${port.id} is not a switchport`)
    return { ...port, l2: { ...port.l2, mode: 'trunk', allowedVlans: 'all' } }
  })
}

/** Gateway SVIs of an L3 switch (`interface Vlan<n>`, `no shutdown`); VLAN 1 stays as it is. */
export function svis(list: readonly { vlan: number; address: string }[]): DeviceChange {
  return (device) => {
    if (!device.switching) throw new Error(`${device.id} has no SVIs`)
    const kept = device.switching.svis.filter((svi) => !list.some((entry) => entry.vlan === svi.vlan))
    const added = list.map(({ vlan, address }) => ({ vlan, adminUp: true, l3: { ipv4: { addressing: 'static' as const, address, mask: MASK_24 } } }))
    return { ...device, switching: { ...device.switching, svis: [...kept, ...added] } }
  }
}

/** `ip routing` with these static routes. */
export function routes(staticRoutes: readonly StaticRoute[]): DeviceChange {
  return (device) => ({ ...device, routing: { ...device.routing, ipRouting: true, staticRoutes: [...staticRoutes] } })
}

/** Adds static routes and keeps the device's existing ones (e.g. a modem's default route). */
export function addRoutes(staticRoutes: readonly StaticRoute[]): DeviceChange {
  return (device) => ({
    ...device,
    routing: { ...device.routing, ipRouting: true, staticRoutes: [...(device.routing?.staticRoutes ?? []), ...staticRoutes] },
  })
}

/** Default route out of a WAN interface cabled to the ISP. */
export function defaultRouteVia(exitInterfaceId: string): StaticRoute {
  return { prefix: '0.0.0.0', mask: '0.0.0.0', exitInterfaceId, adminDistance: 1 }
}

/** Static route to a next hop; a higher distance makes it a floating (backup) route. */
export function routeTo(prefix: string, mask: string, nextHop: string, adminDistance = 1): StaticRoute {
  return { prefix, mask, nextHop, adminDistance }
}

/**
 * DHCP pool for `<prefix>.0/24` (prefix = first three octets): gateway `<prefix>.1`, addresses
 * `<prefix>.100`–`<prefix>.199`, so the low addresses stay free for static devices.
 */
export function lanPool(id: string, prefix: string, dnsServers: readonly string[] = [`${prefix}.1`]): DhcpPool {
  return {
    id,
    network: `${prefix}.0`,
    mask: MASK_24,
    range: { start: `${prefix}.100`, end: `${prefix}.199` },
    defaultRouter: `${prefix}.1`,
    dnsServers: [...dnsServers],
    leases: [],
  }
}

/** DHCP server with these pools. */
export function dhcpServer(pools: readonly DhcpPool[]): DeviceChange {
  return (device) => ({ ...device, services: { ...device.services, dhcp: { enabled: true, pools: [...pools], excludedRanges: [] } } })
}

/** DNS proxy (`ip dns server`) forwarding to the public resolver. */
export function dnsProxy(): DeviceChange {
  return (device) => ({ ...device, services: { ...device.services, dns: { enabled: true, forwarders: [PUBLIC_DNS], records: [] } } })
}

/** Open SSIDs of an access point / wireless router, each bridged into a VLAN. */
export function ssids(list: readonly { ssid: string; vlan: number }[]): DeviceChange {
  return (device) => ({ ...device, wireless: { ssids: list.map(({ ssid, vlan }) => ({ ssid, vlan, security: { mode: 'open' } })) } })
}

/** Re-addresses a home gateway's LAN (SVI + DHCP pool) to `<prefix>.0/24`, gateway `<prefix>.1`. */
export function homeGatewayLan(prefix: string): DeviceChange {
  return (device) => {
    if (!device.switching) throw new Error(`${device.id} is not a home gateway`)
    const lanSvis = device.switching.svis.map((svi) =>
      svi.vlan === 1 ? { ...svi, l3: { ...svi.l3, ipv4: { addressing: 'static' as const, address: `${prefix}.1`, mask: MASK_24 } } } : svi,
    )
    const pool = { ...lanPool('lan', prefix), range: { start: `${prefix}.100`, end: `${prefix}.149` } }
    const withLan = { ...device, switching: { ...device.switching, svis: lanSvis } }
    return dhcpServer([pool])(withLan)
  }
}
