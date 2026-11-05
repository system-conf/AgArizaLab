import type { DhcpResult } from '../domain/EngineContract'
import type { Device, DhcpPool, NetworkState } from '../domain/NetworkTypes'
import { DeviceLookup } from './DeviceLookup'
import { Ipv4 } from './Ipv4'
import type { SegmentFinder } from './SegmentFinder'

interface PoolOwner {
  router: Device
  pool: DhcpPool
}

/** DHCP address assignment from the router in the host's VLAN (PLAN §4.5). Never mutates input. */
export class DhcpService {
  private readonly segments: SegmentFinder

  constructor(segments: SegmentFinder) {
    this.segments = segments
  }

  renew(state: NetworkState, deviceId: string): DhcpResult {
    const device = DeviceLookup.require(state, deviceId)
    if (!device.host || device.host.mode !== 'dhcp') return { ok: false, reason: 'invalidConfig' }
    if (!device.powered) return { ok: false, reason: 'powerOff' }

    const attachment = this.segments.attachment(state, device)
    if (!attachment.ok) return { ok: false, reason: attachment.reason }

    const owner = this.findPool(state, device.id, attachment.vlan)
    if (!owner) return { ok: false, reason: 'dhcpNoServer' }

    const ip = this.pickAddress(state, device, owner.pool)
    if (ip === null) return { ok: false, reason: 'dhcpPoolExhausted' }
    return { ok: true, ip, nextState: this.applyLease(state, device, owner, ip) }
  }

  private findPool(state: NetworkState, hostId: string, vlan: number): PoolOwner | null {
    const segment = this.segments.segment(state, hostId, vlan)
    for (const memberId of segment.members) {
      const member = DeviceLookup.find(state, memberId)
      if (!member || member.kind !== 'router' || !member.powered) continue
      const pool = member.dhcpPools?.find((candidate) => candidate.vlan === vlan)
      if (pool) return { router: member, pool }
    }
    return null
  }

  /** Existing lease for the MAC if still free, else the first free address in the range. */
  private pickAddress(state: NetworkState, device: Device, pool: DhcpPool): string | null {
    const mac = device.mac.toUpperCase()
    const usedByOthers = DeviceLookup.usedAddresses({
      ...state,
      devices: state.devices.filter((candidate) => candidate.id !== device.id),
    })
    for (const lease of pool.leases) {
      if (lease.mac.toUpperCase() !== mac) usedByOthers.add(lease.ip)
    }

    const existing = pool.leases.find((lease) => lease.mac.toUpperCase() === mac)
    if (existing && !usedByOthers.has(existing.ip)) return existing.ip

    const free = Ipv4.range(pool.rangeStart, pool.rangeEnd).find((ip) => !usedByOthers.has(ip))
    return free ?? null
  }

  private applyLease(state: NetworkState, device: Device, owner: PoolOwner, ip: string): NetworkState {
    const mac = device.mac.toUpperCase()
    const { pool } = owner
    const hasLease = pool.leases.some((lease) => lease.mac.toUpperCase() === mac)
    const leases = hasLease
      ? pool.leases.map((lease) => (lease.mac.toUpperCase() === mac ? { mac: lease.mac, ip } : { ...lease }))
      : [...pool.leases.map((lease) => ({ ...lease })), { mac: device.mac, ip }]
    const updatedPool: DhcpPool = { ...pool, dns: [...pool.dns], leases }

    return {
      ...state,
      devices: state.devices.map((candidate) => {
        if (candidate.id === device.id) {
          return {
            ...candidate,
            host: { mode: 'dhcp', ip, mask: pool.mask, gateway: pool.gateway, dns: [...pool.dns] },
          }
        }
        if (candidate.id === owner.router.id) {
          return {
            ...candidate,
            dhcpPools: (candidate.dhcpPools ?? []).map((existing) =>
              existing.id === pool.id ? updatedPool : existing,
            ),
          }
        }
        return candidate
      }),
    }
  }
}
