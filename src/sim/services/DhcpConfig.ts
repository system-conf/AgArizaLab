import type { Device, DhcpPool, NetworkState } from '../../domain'
import { DeviceAddresses } from '../../engine/DeviceAddresses'
import { Ipv4 } from '../../engine/Ipv4'
import { L3Interfaces } from '../../engine/L3Interfaces'

/** A pool and the device serving it. */
export interface PoolRef {
  readonly serverId: string
  readonly pool: DhcpPool
}

/** Configuration reads of the DHCP roles (never runtime): pools, clients by MAC, servers by address. */
export class DhcpConfig {
  /** IOS rule: the pool whose network lies in the subnet of the receiving interface. */
  static poolForInterface(device: Device, interfaceId: string): DhcpPool | undefined {
    const iface = L3Interfaces.find(device, interfaceId)
    if (!iface || !L3Interfaces.isAddressed(iface)) return undefined
    return device.services?.dhcp?.pools.find((pool) => Ipv4.isValid(pool.network) && Ipv4.sameSubnet(pool.network, iface.address, iface.mask))
  }

  /** Relayed request: the pool whose network holds the relay agent address (giaddr). */
  static poolForRelay(device: Device, giaddr: string): DhcpPool | undefined {
    return device.services?.dhcp?.pools.find((pool) => Ipv4.isValid(pool.network) && Ipv4.sameSubnet(pool.network, giaddr, pool.mask))
  }

  /**
   * Addresses the allocator must skip for `mac` (engine parity): every other device's addresses plus the
   * client's own other interfaces. The client is found by its NIC MAC in the configuration.
   */
  static addressesInUse(network: NetworkState, mac: string): Set<string> {
    const client = DhcpConfig.clientOf(network, mac)
    if (!client) return DeviceAddresses.usedAddresses(network)
    const inUse = DeviceAddresses.usedAddresses(network, client.device.id)
    for (const iface of L3Interfaces.of(client.device)) {
      if (iface.id !== client.portId && iface.address !== '') inUse.add(iface.address)
    }
    return inUse
  }

  /** The device and port owning a MAC (port MAC first, else a device whose base MAC it is). */
  static clientOf(network: NetworkState, mac: string): { device: Device; portId: string } | undefined {
    const wanted = mac.toUpperCase()
    for (const device of network.devices) {
      const port = device.ports.find((candidate) => candidate.mac?.toUpperCase() === wanted)
      if (port) return { device, portId: port.id }
    }
    const owner = network.devices.find((device) => device.baseMac.toUpperCase() === wanted)
    const first = owner ? L3Interfaces.nics(owner)[0] : undefined
    return owner && first ? { device: owner, portId: first.id } : undefined
  }

  /** Server device and pool behind an ACK: the DHCP device owning `serverIp`, pool holding `yourIp`. */
  static leaseSource(network: NetworkState, serverIp: string, yourIp: string): PoolRef | undefined {
    for (const device of network.devices) {
      const dhcp = device.services?.dhcp
      if (!dhcp || !DeviceAddresses.has(device, serverIp)) continue
      const pool = dhcp.pools.find((candidate) => Ipv4.isValid(candidate.network) && Ipv4.sameSubnet(candidate.network, yourIp, candidate.mask))
      if (pool) return { serverId: device.id, pool }
    }
    return undefined
  }

  /**
   * Where a DHCPRELEASE goes when the client has no runtime lease (an address from the lab file): the
   * server whose pool records `mac` → `ip`, at its interface in that subnet (else its first address).
   */
  static releaseTarget(network: NetworkState, mac: string, ip: string): string | undefined {
    const wanted = mac.toUpperCase()
    for (const device of network.devices) {
      const pool = device.services?.dhcp?.pools.find((candidate) =>
        candidate.leases.some((lease) => lease.mac.toUpperCase() === wanted && lease.ip === ip),
      )
      if (!pool) continue
      const addressed = L3Interfaces.of(device).filter((iface) => L3Interfaces.isAddressed(iface))
      const local = addressed.find((iface) => Ipv4.sameSubnet(iface.address, ip, iface.mask))
      return (local ?? addressed[0])?.address
    }
    return undefined
  }
}
