import type { Device, HostSettings, NetworkState, Port } from '../../domain'
import { L3Interfaces } from '../../engine/L3Interfaces'
import type { StateEffect } from '../contract'

type LeaseBound = Extract<StateEffect, { kind: 'dhcpLeaseBound' }>

/**
 * Applies DHCP configuration effects (docs/SIMULATION.md §5.4) with exactly the rule engine's DhcpService
 * rules. Pure: never mutates its input; untouched devices are shared with the new state.
 * - bound: the NIC gets the address in 'dhcp' mode; host gateway / DNS come from the lease unless another
 *   NIC of the host has a static address (then the static settings win and the lease only fills empty
 *   fields); the server pool keeps one lease record per MAC (a stale address is replaced).
 * - released: the NIC loses its address; gateway / DNS are cleared only when no other NIC keeps an
 *   address; the server keeps the lease record.
 */
export class DhcpEffects {
  static apply(state: NetworkState, effect: StateEffect): NetworkState {
    if (!state.devices.some((device) => device.id === effect.clientId)) return state
    switch (effect.kind) {
      case 'dhcpLeaseBound':
        return DhcpEffects.bound(state, effect)
      case 'dhcpLeaseReleased':
        return DhcpEffects.updateDevice(state, effect.clientId, (device) => {
          const othersAddressed = L3Interfaces.nics(device).some((nic) => nic.id !== effect.portId && nic.address !== '')
          return {
            ...device,
            ports: device.ports.map((port) => (port.id === effect.portId ? DhcpEffects.withAddress(port, '', '') : port)),
            ...(device.host && !othersAddressed ? { host: { ...device.host, defaultGateway: '', dnsServers: [] } } : {}),
          }
        })
    }
  }

  private static bound(state: NetworkState, effect: LeaseBound): NetworkState {
    const withClient = DhcpEffects.updateDevice(state, effect.clientId, (device) => ({
      ...device,
      ports: device.ports.map((port) => (port.id === effect.portId ? DhcpEffects.withAddress(port, effect.ip, effect.mask) : port)),
      ...(device.host ? { host: DhcpEffects.hostAfterLease(device.host, device, effect) } : {}),
    }))
    const mac = effect.mac.toUpperCase()
    const isClient = (lease: { mac: string }) => lease.mac.toUpperCase() === mac
    return DhcpEffects.updateDevice(withClient, effect.serverId, (server) => {
      const dhcp = server.services?.dhcp
      if (!dhcp) return server
      const pools = dhcp.pools.map((pool) => {
        if (pool.id !== effect.poolId) return pool
        // One record per MAC: the first is updated in place (a stale address is replaced), duplicates go.
        const first = pool.leases.findIndex(isClient)
        const leases =
          first >= 0
            ? pool.leases.flatMap((lease, index) => (index === first ? [{ mac: lease.mac, ip: effect.ip }] : isClient(lease) ? [] : [{ ...lease }]))
            : [...pool.leases.map((lease) => ({ ...lease })), { mac: effect.mac, ip: effect.ip }]
        return { ...pool, leases }
      })
      return { ...server, services: { ...server.services, dhcp: { ...dhcp, pools } } }
    })
  }

  /** Host-wide gateway / DNS after a lease: a statically addressed other NIC wins. */
  private static hostAfterLease(host: HostSettings, device: Device, effect: LeaseBound): HostSettings {
    const staticWins = L3Interfaces.nics(device).some((nic) => nic.id !== effect.portId && nic.addressing === 'static' && nic.address !== '')
    if (!staticWins) return { ...host, defaultGateway: effect.gateway, dnsServers: [...effect.dnsServers] }
    return {
      ...host,
      defaultGateway: host.defaultGateway === '' ? effect.gateway : host.defaultGateway,
      dnsServers: host.dnsServers.length === 0 ? [...effect.dnsServers] : host.dnsServers,
    }
  }

  private static withAddress(port: Port, address: string, mask: string): Port {
    if (port.role !== 'host') return port
    return { ...port, l3: { ...port.l3, ipv4: { addressing: 'dhcp', address, mask } } }
  }

  private static updateDevice(state: NetworkState, deviceId: string, change: (device: Device) => Device): NetworkState {
    return { ...state, devices: state.devices.map((device) => (device.id === deviceId ? change(device) : device)) }
  }
}
