// Test-only: what the learner does in the sample labs, as state edits (the documented step solutions
// and break-it changes). Uses the engine test helpers; DHCP renews go through the rule engine, relayed
// DHCP through the simulator (the rule engine does not relay).
import type { AddressRange, Device, DhcpPool, NetworkState, StaticRoute, SubInterface } from '../../domain'
import { networkEngine } from '../../engine'
import { editAddress, editDevice, editHost, editLink, editPort, editSwitchport } from '../../engine/testLabs'
import { createSimulation, SimTerminal } from '../../sim'
import { MASK_24, vlanEntries } from './sampleKit'

export type Solution = (state: NetworkState) => NetworkState

export function device(state: NetworkState, id: string): Device {
  const found = state.devices.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`No device ${id}`)
  return found
}

/** `ipconfig /renew` with the rule engine; throws when no address comes back. */
export function renew(state: NetworkState, deviceId: string): NetworkState {
  const result = networkEngine.renewDhcp(state, deviceId)
  if (!result.ok) throw new Error(`${deviceId} got no lease: ${result.reason}`)
  return result.nextState
}

/** `ipconfig /renew` typed into the workspace terminal (simulator; the lease is written to the lab). */
export function simRenew(state: NetworkState, deviceId: string): NetworkState {
  const outcome = SimTerminal.run(createSimulation(state), deviceId, 'ipconfig /renew')
  if (!outcome.nextState) throw new Error(`${deviceId} got no lease in the simulator`)
  return outcome.nextState
}

export function setStatic(state: NetworkState, deviceId: string, address: string, mask = MASK_24, portId = 'eth0'): NetworkState {
  return editAddress(state, deviceId, portId, { addressing: 'static', address, mask })
}

export function setGateway(state: NetworkState, deviceId: string, defaultGateway: string): NetworkState {
  return editHost(state, deviceId, { defaultGateway })
}

export function setDns(state: NetworkState, deviceId: string, dnsServers: string[]): NetworkState {
  return editHost(state, deviceId, { dnsServers })
}

export function power(state: NetworkState, deviceId: string, powered: boolean): NetworkState {
  return editDevice(state, deviceId, (current) => ({ ...current, powered }))
}

export function plug(state: NetworkState, linkId: string, connected = true): NetworkState {
  return editLink(state, linkId, (link) => ({ ...link, connected }))
}

export function addRoute(state: NetworkState, routerId: string, route: StaticRoute): NetworkState {
  return editDevice(state, routerId, (router) => ({
    ...router,
    routing: { ipRouting: router.routing?.ipRouting ?? true, ...router.routing, staticRoutes: [...(router.routing?.staticRoutes ?? []), route] },
  }))
}

export function removeRoutes(state: NetworkState, routerId: string, prefix: string): NetworkState {
  return editDevice(state, routerId, (router) => {
    if (!router.routing) throw new Error(`${routerId} does not route`)
    return { ...router, routing: { ...router.routing, staticRoutes: router.routing.staticRoutes.filter((route) => route.prefix !== prefix) } }
  })
}

export function setIpRouting(state: NetworkState, deviceId: string, ipRouting: boolean): NetworkState {
  return editDevice(state, deviceId, (current) => ({ ...current, routing: { staticRoutes: [], ...current.routing, ipRouting } }))
}

function editDhcp(state: NetworkState, serverId: string, change: (pools: DhcpPool[], excluded: AddressRange[]) => [DhcpPool[], AddressRange[]]): NetworkState {
  return editDevice(state, serverId, (server) => {
    const dhcp = server.services?.dhcp
    if (!dhcp) throw new Error(`${serverId} runs no DHCP`)
    const [pools, excludedRanges] = change(dhcp.pools, dhcp.excludedRanges)
    return { ...server, services: { ...server.services, dhcp: { ...dhcp, pools, excludedRanges } } }
  })
}

export function exclude(state: NetworkState, serverId: string, range: AddressRange): NetworkState {
  return editDhcp(state, serverId, (pools, excluded) => [pools, [...excluded, range]])
}

export function addPool(state: NetworkState, serverId: string, entry: DhcpPool): NetworkState {
  return editDhcp(state, serverId, (pools, excluded) => [[...pools, entry], excluded])
}

export function removePool(state: NetworkState, serverId: string, poolId: string): NetworkState {
  return editDhcp(state, serverId, (pools, excluded) => [pools.filter((entry) => entry.id !== poolId), excluded])
}

export function addDnsRecord(state: NetworkState, serverId: string, name: string, address: string): NetworkState {
  return editDevice(state, serverId, (server) => {
    const dns = server.services?.dns
    if (!dns) throw new Error(`${serverId} runs no DNS`)
    return { ...server, services: { ...server.services, dns: { ...dns, records: [...dns.records, { type: 'A', name, address }] } } }
  })
}

export function setForwarders(state: NetworkState, serverId: string, forwarders: string[]): NetworkState {
  return editDevice(state, serverId, (server) => {
    const dns = server.services?.dns
    if (!dns) throw new Error(`${serverId} runs no DNS`)
    return { ...server, services: { ...server.services, dns: { ...dns, forwarders } } }
  })
}

export function setVlans(state: NetworkState, switchId: string, ids: number[]): NetworkState {
  return editDevice(state, switchId, (current) => {
    if (!current.switching) throw new Error(`${switchId} has no VLAN database`)
    return { ...current, switching: { ...current.switching, vlans: vlanEntries([1, ...ids.filter((id) => id !== 1)]) } }
  })
}

export function accessVlan(state: NetworkState, switchId: string, portId: string, vlan: number): NetworkState {
  return editSwitchport(state, switchId, portId, { mode: 'access', accessVlan: vlan })
}

export function trunk(state: NetworkState, switchId: string, portId: string, patch: { nativeVlan?: number; allowedVlans?: 'all' | number[] } = {}): NetworkState {
  return editSwitchport(state, switchId, portId, { mode: 'trunk', ...patch })
}

export function addSubInterface(state: NetworkState, routerId: string, portId: string, vlan: number, address: string): NetworkState {
  const subInterface: SubInterface = { id: `${portId}.${vlan}`, vlan, adminUp: true, l3: { ipv4: { addressing: 'static', address, mask: MASK_24 } } }
  return editPort(state, routerId, portId, (port) => {
    if (port.role !== 'routed') throw new Error(`${routerId}/${portId} is not routed`)
    return { ...port, subInterfaces: [...port.subInterfaces, subInterface] }
  })
}

export function addSvi(state: NetworkState, switchId: string, vlan: number, address: string): NetworkState {
  return editDevice(state, switchId, (current) => {
    if (!current.switching) throw new Error(`${switchId} has no SVIs`)
    const svi = { vlan, adminUp: true, l3: { ipv4: { addressing: 'static' as const, address, mask: MASK_24 } } }
    return { ...current, switching: { ...current.switching, svis: [...current.switching.svis, svi] } }
  })
}

/** Applies the edits left to right. */
export function steps(...edits: Solution[]): Solution {
  return (state) => edits.reduce((current, edit) => edit(current), state)
}

/** `ip route <prefix> <mask> <nextHop> [<distance>]`. */
export function route(prefix: string, mask: string, nextHop: string, adminDistance = 1): StaticRoute {
  return { prefix, mask, nextHop, adminDistance }
}

/** `ip helper-address` list of a routed port ([] = `no ip helper-address`). */
export function setHelpers(state: NetworkState, routerId: string, portId: string, addresses: string[]): NetworkState {
  return editPort(state, routerId, portId, (port) => {
    if (port.role !== 'routed') throw new Error(`${routerId}/${portId} is not routed`)
    const l3 = { ...port.l3 }
    delete l3.helperAddresses
    if (addresses.length > 0) l3.helperAddresses = addresses
    return { ...port, l3 }
  })
}
