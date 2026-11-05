import type { DeviceV2, DhcpPoolV2, FailureReasonV2, NetworkStateV2, Port } from '../../domain/v2'
import { Ipv4 } from '../Ipv4'
import { DeviceAddressesV2 } from './DeviceAddressesV2'
import { DhcpPoolAllocator } from './DhcpPoolAllocator'
import { HostAttachmentV2 } from './HostAttachmentV2'
import { type L3Interface, L3Interfaces } from './L3Interfaces'
import type { SegmentFinderV2 } from './SegmentFinderV2'
import { TopologyV2 } from './TopologyV2'

/** A DHCP failure names the NIC it happened on (Windows' error text names the adapter). */
export type DhcpFailureV2 = { ok: false; reason: FailureReasonV2; portId?: string }
export type DhcpRenewResultV2 = { ok: true; nextState: NetworkStateV2; ip: string } | DhcpFailureV2
export type DhcpReleaseResultV2 = { ok: true; nextState: NetworkStateV2 } | DhcpFailureV2

interface PoolOwner {
  serverId: string
  pool: DhcpPoolV2
}

/**
 * DHCP on v2 hosts (MODEL_V2 §4, §13). Without a port id every active NIC in 'dhcp' mode is renewed;
 * the pool is the one whose network lies in the subnet of the server interface the request arrives
 * on. Never mutates its input; untouched devices are shared with the new state.
 */
export class DhcpServiceV2 {
  private readonly segments: SegmentFinderV2

  constructor(segments: SegmentFinderV2) {
    this.segments = segments
  }

  renew(state: NetworkStateV2, deviceId: string, portId?: string): DhcpRenewResultV2 {
    const checked = this.dhcpNics(state, deviceId, portId)
    if (!checked.ok) return checked
    let current = state
    let firstIp: string | null = null
    let firstFailure: DhcpFailureV2 | null = null
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
   * `ipconfig /release`: the NIC gives its address back; the host keeps no gateway or DNS. The
   * server keeps the lease record, so the next renew offers the same address again.
   */
  release(state: NetworkStateV2, deviceId: string, portId?: string): DhcpReleaseResultV2 {
    const checked = this.dhcpNics(state, deviceId, portId)
    if (!checked.ok) return checked
    const topology = TopologyV2.of(state)
    const released: string[] = []
    let firstFailure: DhcpFailureV2 | null = null
    for (const nic of checked.nics) {
      const attachment = HostAttachmentV2.attach(topology, nic)
      if (attachment.ok) released.push(nic.id)
      else firstFailure ??= { ok: false, reason: attachment.reason, portId: nic.id }
    }
    if (released.length === 0) return firstFailure ?? { ok: false, reason: 'invalidConfig' }
    return {
      ok: true,
      nextState: this.updateDevice(state, deviceId, (device) => ({
        ...device,
        ports: device.ports.map((port) => (released.includes(port.id) ? this.withAddress(port, '', '') : port)),
        ...(device.host ? { host: { ...device.host, defaultGateway: '', dnsServers: [] } } : {}),
      })),
    }
  }

  /** The NICs to work on, after the checks every DHCP command starts with (static → invalidConfig, off → powerOff). */
  private dhcpNics(state: NetworkStateV2, deviceId: string, portId: string | undefined): { ok: true; nics: L3Interface[] } | DhcpFailureV2 {
    const topology = TopologyV2.of(state)
    const device = topology.require(deviceId)
    const candidates =
      portId === undefined
        ? HostAttachmentV2.activeNics(topology, device)
        : L3Interfaces.nics(device).filter((nic) => nic.id === portId)
    const nics = candidates.filter((nic) => nic.addressing === 'dhcp')
    if (nics.length === 0) return { ok: false, reason: 'invalidConfig', ...(portId === undefined ? {} : { portId }) }
    if (!device.powered) return { ok: false, reason: 'powerOff', portId: nics[0]?.id }
    return { ok: true, nics }
  }

  private renewNic(state: NetworkStateV2, deviceId: string, nicId: string): DhcpRenewResultV2 {
    const topology = TopologyV2.of(state)
    const device = topology.require(deviceId)
    const nic = L3Interfaces.find(device, nicId)
    if (!nic) return { ok: false, reason: 'invalidConfig', portId: nicId }
    const attachment = HostAttachmentV2.attach(topology, nic)
    if (!attachment.ok) return { ok: false, reason: attachment.reason, portId: nicId }

    const owner = this.findPool(state, nic)
    if (!owner) return { ok: false, reason: 'dhcpNoServer', portId: nicId }
    const server = topology.require(owner.serverId)
    const mac = device.ports.find((port) => port.id === nicId)?.mac ?? device.baseMac
    const ip = DhcpPoolAllocator.pick(
      owner.pool,
      mac,
      DeviceAddressesV2.usedAddresses(state, deviceId),
      server.services?.dhcp?.excludedRanges ?? [],
    )
    if (ip === null) return { ok: false, reason: 'dhcpPoolExhausted', portId: nicId }
    return { ok: true, ip, nextState: this.applyLease(state, deviceId, nicId, mac, owner, ip) }
  }

  /** First DHCP server interface in the NIC's segment that has a pool for its own subnet. */
  private findPool(state: NetworkStateV2, nic: L3Interface): PoolOwner | null {
    const topology = TopologyV2.of(state)
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

  private applyLease(state: NetworkStateV2, clientId: string, nicId: string, mac: string, owner: PoolOwner, ip: string): NetworkStateV2 {
    const { pool } = owner
    const withClient = this.updateDevice(state, clientId, (device) => ({
      ...device,
      ports: device.ports.map((port) => (port.id === nicId ? this.withAddress(port, ip, pool.mask) : port)),
      ...(device.host ? { host: { ...device.host, defaultGateway: pool.defaultRouter, dnsServers: [...pool.dnsServers] } } : {}),
    }))
    const hasLease = pool.leases.some((lease) => lease.mac.toUpperCase() === mac.toUpperCase())
    const leases = hasLease
      ? pool.leases.map((lease) => (lease.mac.toUpperCase() === mac.toUpperCase() ? { mac: lease.mac, ip } : { ...lease }))
      : [...pool.leases.map((lease) => ({ ...lease })), { mac, ip }]
    return this.updateDevice(withClient, owner.serverId, (server) => {
      const dhcp = server.services?.dhcp
      if (!dhcp) return server
      const pools = dhcp.pools.map((candidate) => (candidate.id === pool.id ? { ...candidate, leases } : candidate))
      return { ...server, services: { ...server.services, dhcp: { ...dhcp, pools } } }
    })
  }

  private withAddress(port: Port, address: string, mask: string): Port {
    if (port.role !== 'host') return port
    return { ...port, l3: { ...port.l3, ipv4: { addressing: 'dhcp', address, mask } } }
  }

  private updateDevice(state: NetworkStateV2, deviceId: string, change: (device: DeviceV2) => DeviceV2): NetworkStateV2 {
    return { ...state, devices: state.devices.map((device) => (device.id === deviceId ? change(device) : device)) }
  }
}
