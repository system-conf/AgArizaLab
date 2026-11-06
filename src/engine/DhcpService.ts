import type { Device, DhcpPool, FailureReason, HostSettings, NetworkState, Port } from '../domain'
import { Ipv4 } from './Ipv4'
import { DeviceAddresses } from './DeviceAddresses'
import { DhcpPoolAllocator } from './DhcpPoolAllocator'
import { HostAttachment } from './HostAttachment'
import { type L3Interface, L3Interfaces } from './L3Interfaces'
import type { SegmentFinder } from './SegmentFinder'
import { Topology } from './Topology'

/** A DHCP failure names the NIC it happened on (Windows' error text names the adapter). */
export type DhcpFailure = { ok: false; reason: FailureReason; portId?: string }
export type DhcpRenewResult = { ok: true; nextState: NetworkState; ip: string } | DhcpFailure
export type DhcpReleaseResult = { ok: true; nextState: NetworkState } | DhcpFailure

interface PoolOwner {
  serverId: string
  pool: DhcpPool
}

/**
 * DHCP on v2 hosts (MODEL_V2 §4, §13). Without a port id every active NIC in 'dhcp' mode is renewed;
 * the pool is the one whose network lies in the subnet of the server interface the request arrives
 * on. Never mutates its input; untouched devices are shared with the new state.
 *
 * Gateway and DNS servers are host-wide (`HostSettings`), not per NIC, so with several NICs:
 * - renew: the lease's router / DNS servers replace the host-wide values, unless another NIC of the
 *   host has a static address. Then the static configuration wins (the user typed it, like a static
 *   adapter's gateway on Windows) and the lease only fills a host-wide field that is still empty.
 *   With several DHCP NICs the most recent lease wins.
 * - release: the host-wide gateway / DNS servers are cleared only when no other NIC of the host still
 *   has an address; otherwise the remaining NICs keep using them.
 */
export class DhcpService {
  private readonly segments: SegmentFinder

  constructor(segments: SegmentFinder) {
    this.segments = segments
  }

  renew(state: NetworkState, deviceId: string, portId?: string): DhcpRenewResult {
    const checked = this.dhcpNics(state, deviceId, portId)
    if (!checked.ok) return checked
    let current = state
    let firstIp: string | null = null
    let firstFailure: DhcpFailure | null = null
    for (const nic of checked.nics) {
      const result = this.renewNic(current, deviceId, nic.id)
      if (result.ok) {
        current = result.nextState
        firstIp ??= result.ip
      } else {
        firstFailure ??= result
      }
    }
    if (firstIp !== null) return { ok: true, nextState: current, ip: firstIp }
    return firstFailure ?? { ok: false, reason: 'invalidConfig' }
  }

  /**
   * `ipconfig /release`: the NIC gives its address back; gateway and DNS go too when no other NIC of
   * the host keeps an address (see the class comment). The server keeps the lease record, so the next
   * renew offers the same address again.
   */
  release(state: NetworkState, deviceId: string, portId?: string): DhcpReleaseResult {
    const checked = this.dhcpNics(state, deviceId, portId)
    if (!checked.ok) return checked
    const topology = Topology.of(state)
    const released: string[] = []
    let firstFailure: DhcpFailure | null = null
    for (const nic of checked.nics) {
      const attachment = HostAttachment.attach(topology, nic)
      if (attachment.ok) released.push(nic.id)
      else firstFailure ??= { ok: false, reason: attachment.reason, portId: nic.id }
    }
    if (released.length === 0) return firstFailure ?? { ok: false, reason: 'invalidConfig' }
    return {
      ok: true,
      nextState: this.updateDevice(state, deviceId, (device) => {
        const othersAddressed = L3Interfaces.nics(device).some((nic) => !released.includes(nic.id) && nic.address !== '')
        return {
          ...device,
          ports: device.ports.map((port) => (released.includes(port.id) ? this.withAddress(port, '', '') : port)),
          ...(device.host && !othersAddressed ? { host: { ...device.host, defaultGateway: '', dnsServers: [] } } : {}),
        }
      }),
    }
  }

  /** The NICs to work on, after the checks every DHCP command starts with (static → invalidConfig, off → powerOff). */
  private dhcpNics(state: NetworkState, deviceId: string, portId: string | undefined): { ok: true; nics: L3Interface[] } | DhcpFailure {
    const topology = Topology.of(state)
    const device = topology.require(deviceId)
    const candidates =
      portId === undefined
        ? HostAttachment.activeNics(topology, device)
        : L3Interfaces.nics(device).filter((nic) => nic.id === portId)
    const nics = candidates.filter((nic) => nic.addressing === 'dhcp')
    if (nics.length === 0) return { ok: false, reason: 'invalidConfig', ...(portId === undefined ? {} : { portId }) }
    if (!device.powered) return { ok: false, reason: 'powerOff', portId: nics[0]?.id }
    return { ok: true, nics }
  }

  private renewNic(state: NetworkState, deviceId: string, nicId: string): DhcpRenewResult {
    const topology = Topology.of(state)
    const device = topology.require(deviceId)
    const nic = L3Interfaces.find(device, nicId)
    if (!nic) return { ok: false, reason: 'invalidConfig', portId: nicId }
    const attachment = HostAttachment.attach(topology, nic)
    if (!attachment.ok) return { ok: false, reason: attachment.reason, portId: nicId }

    const owner = this.findPool(state, nic)
    if (!owner) return { ok: false, reason: 'dhcpNoServer', portId: nicId }
    const server = topology.require(owner.serverId)
    const mac = device.ports.find((port) => port.id === nicId)?.mac ?? device.baseMac
    // Other devices' addresses, plus the client's own other interfaces (eth1 must not get eth0's address).
    const inUse = DeviceAddresses.usedAddresses(state, deviceId)
    for (const iface of L3Interfaces.of(device)) {
      if (iface.id !== nicId && iface.address !== '') inUse.add(iface.address)
    }
    const ip = DhcpPoolAllocator.pick(owner.pool, mac, inUse, server.services?.dhcp?.excludedRanges ?? [])
    if (ip === null) return { ok: false, reason: 'dhcpPoolExhausted', portId: nicId }
    return { ok: true, ip, nextState: this.applyLease(state, deviceId, nicId, mac, owner, ip) }
  }

  /** First DHCP server interface in the NIC's segment that has a pool for its own subnet. */
  private findPool(state: NetworkState, nic: L3Interface): PoolOwner | null {
    const topology = Topology.of(state)
    for (const member of this.segments.segment(state, nic).members) {
      if (member.deviceId === nic.deviceId || !L3Interfaces.isAddressed(member)) continue
      const server = topology.find(member.deviceId)
      const dhcp = server?.services?.dhcp
      if (!server?.powered || !dhcp?.enabled) continue
      const pool = dhcp.pools.find((candidate) => Ipv4.isValid(candidate.network) && Ipv4.sameSubnet(candidate.network, member.address, member.mask))
      if (pool) return { serverId: server.id, pool }
    }
    return null
  }

  private applyLease(state: NetworkState, clientId: string, nicId: string, mac: string, owner: PoolOwner, ip: string): NetworkState {
    const { pool } = owner
    const withClient = this.updateDevice(state, clientId, (device) => ({
      ...device,
      ports: device.ports.map((port) => (port.id === nicId ? this.withAddress(port, ip, pool.mask) : port)),
      ...(device.host ? { host: this.hostAfterLease(device.host, device, nicId, pool) } : {}),
    }))
    // One record per MAC: the first is updated in place (a stale address is replaced), duplicates go.
    const isClient = (lease: { mac: string }) => lease.mac.toUpperCase() === mac.toUpperCase()
    const first = pool.leases.findIndex(isClient)
    const leases =
      first >= 0
        ? pool.leases.flatMap((lease, index) => (index === first ? [{ mac: lease.mac, ip }] : isClient(lease) ? [] : [{ ...lease }]))
        : [...pool.leases.map((lease) => ({ ...lease })), { mac, ip }]
    return this.updateDevice(withClient, owner.serverId, (server) => {
      const dhcp = server.services?.dhcp
      if (!dhcp) return server
      const pools = dhcp.pools.map((candidate) => (candidate.id === pool.id ? { ...candidate, leases } : candidate))
      return { ...server, services: { ...server.services, dhcp: { ...dhcp, pools } } }
    })
  }

  /** Host-wide gateway / DNS after a lease on `nicId`: a statically addressed other NIC wins (class comment). */
  private hostAfterLease(host: HostSettings, device: Device, nicId: string, pool: DhcpPool): HostSettings {
    const staticWins = L3Interfaces.nics(device).some((nic) => nic.id !== nicId && nic.addressing === 'static' && nic.address !== '')
    if (!staticWins) return { ...host, defaultGateway: pool.defaultRouter, dnsServers: [...pool.dnsServers] }
    return {
      ...host,
      defaultGateway: host.defaultGateway === '' ? pool.defaultRouter : host.defaultGateway,
      dnsServers: host.dnsServers.length === 0 ? [...pool.dnsServers] : host.dnsServers,
    }
  }

  private withAddress(port: Port, address: string, mask: string): Port {
    if (port.role !== 'host') return port
    return { ...port, l3: { ...port.l3, ipv4: { addressing: 'dhcp', address, mask } } }
  }

  private updateDevice(state: NetworkState, deviceId: string, change: (device: Device) => Device): NetworkState {
    return { ...state, devices: state.devices.map((device) => (device.id === deviceId ? change(device) : device)) }
  }
}
