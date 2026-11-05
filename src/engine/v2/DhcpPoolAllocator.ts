import type { AddressRange, DhcpPoolV2 } from '../../domain/v2'
import { Ipv4 } from '../Ipv4'

/**
 * Picks the address a DHCP pool offers (MODEL_V2 §4): the client's existing lease if that address is
 * still free, else the first free host address of `network` ∩ `range` that is neither excluded nor
 * in use.
 */
export class DhcpPoolAllocator {
  static pick(pool: DhcpPoolV2, clientMac: string, inUse: ReadonlySet<string>, excluded: readonly AddressRange[]): string | null {
    const mac = clientMac.toUpperCase()
    const taken = new Set(inUse)
    for (const lease of pool.leases) {
      if (lease.mac.toUpperCase() !== mac) taken.add(lease.ip)
    }
    const existing = pool.leases.find((lease) => lease.mac.toUpperCase() === mac)
    if (existing && !taken.has(existing.ip)) return existing.ip

    const window = DhcpPoolAllocator.window(pool)
    if (!window) return null
    const exclusions = excluded.map((range) => ({ start: Ipv4.parse(range.start), end: Ipv4.parse(range.end) }))
    for (let value = window.start; value <= window.end; value += 1) {
      const isExcluded = exclusions.some(({ start, end }) => start !== null && end !== null && value >= start && value <= end)
      if (isExcluded) continue
      const ip = Ipv4.format(value)
      if (!taken.has(ip)) return ip
    }
    return null
  }

  /** Host addresses of the pool network, narrowed to `range` when set; null when invalid or empty. */
  private static window(pool: DhcpPoolV2): { start: number; end: number } | null {
    const network = Ipv4.network(pool.network, pool.mask)
    const prefix = Ipv4.prefixLength(pool.mask)
    if (network === null || prefix === null) return null
    const size = 2 ** (32 - prefix)
    // /31 and /32 have no network / broadcast pair (RFC 3021).
    let start = size <= 2 ? network : network + 1
    let end = size <= 2 ? network + size - 1 : network + size - 2
    if (pool.range) {
      const rangeStart = Ipv4.parse(pool.range.start)
      const rangeEnd = Ipv4.parse(pool.range.end)
      if (rangeStart === null || rangeEnd === null) return null
      start = Math.max(start, rangeStart)
      end = Math.min(end, rangeEnd)
    }
    return start <= end ? { start, end } : null
  }
}
