import type { AddressRange, DhcpPool } from '../domain'
import { Ipv4 } from './Ipv4'

interface Span {
  start: number
  end: number
}

/**
 * Picks the address a DHCP pool offers (MODEL_V2 §4): the client's existing lease if that address is
 * still offerable (inside the allocation window, not excluded, not used by another device or lease),
 * else the first free host address of `network` ∩ `range` that is neither excluded nor in use.
 *
 * Works on the gaps between blocked spans (exclusions, used addresses, other leases), so the cost
 * depends on how many of those there are, never on the pool size (imported labs may hold /8 pools).
 */
export class DhcpPoolAllocator {
  static pick(pool: DhcpPool, clientMac: string, inUse: ReadonlySet<string>, excluded: readonly AddressRange[]): string | null {
    const window = DhcpPoolAllocator.window(pool)
    if (!window) return null
    const mac = clientMac.toUpperCase()
    const taken = new Set(inUse)
    for (const lease of pool.leases) {
      if (lease.mac.toUpperCase() !== mac) taken.add(lease.ip)
    }
    const exclusions = DhcpPoolAllocator.exclusionSpans(excluded)

    const existing = pool.leases.find((lease) => lease.mac.toUpperCase() === mac)
    const leased = existing ? Ipv4.parse(existing.ip) : null
    if (
      existing &&
      leased !== null &&
      DhcpPoolAllocator.contains(window, leased) &&
      !exclusions.some((span) => DhcpPoolAllocator.contains(span, leased)) &&
      !taken.has(existing.ip)
    ) {
      return existing.ip
    }

    const blocked: Span[] = [...exclusions]
    for (const ip of taken) {
      const value = Ipv4.parse(ip)
      if (value !== null) blocked.push({ start: value, end: value })
    }
    blocked.sort((first, second) => first.start - second.start)
    // `candidate` is the lowest address not yet known to be blocked; spans are walked in start order.
    let candidate = window.start
    for (const span of blocked) {
      if (span.end < candidate) continue
      if (span.start > candidate) break
      candidate = span.end + 1
      if (candidate > window.end) return null
    }
    return candidate <= window.end ? Ipv4.format(candidate) : null
  }

  /** Host addresses of the pool network, narrowed to `range` when set; null when invalid or empty. */
  private static window(pool: DhcpPool): Span | null {
    const base = Ipv4.parse(pool.network)
    const prefix = Ipv4.prefixLength(pool.mask)
    if (base === null || prefix === null) return null
    const network = (base & Ipv4.prefixToMask(prefix)) >>> 0
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

  /** Valid exclusion ranges as numeric spans; a malformed or reversed range excludes nothing. */
  private static exclusionSpans(excluded: readonly AddressRange[]): Span[] {
    const spans: Span[] = []
    for (const range of excluded) {
      const start = Ipv4.parse(range.start)
      const end = Ipv4.parse(range.end)
      if (start !== null && end !== null && start <= end) spans.push({ start, end })
    }
    return spans
  }

  private static contains(span: Span, value: number): boolean {
    return value >= span.start && value <= span.end
  }
}
