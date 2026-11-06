// `show ip dhcp binding` and `show ip dhcp pool` (docs/CLI.md §7): bindings from the simulator's DHCP
// server (env.runtime.services.dhcpBindings), pools from the device's configuration.
import type { DhcpServerSettings } from '../../domain'
import { DhcpPoolAllocator } from '../../net/DhcpPoolAllocator'
import { Ipv4 } from '../../net/Ipv4'
import type { DhcpBinding } from '../../sim/contract'
import { ciscoMac } from './ArpTableView'

const BINDING_HEADER = ['IP address       Client-ID/              Lease expiration        Type', '                 Hardware address']

interface Span {
  readonly first: number
  readonly last: number
}

/** Host addresses of a network (/31 and /32 have no network / broadcast pair). */
function hostSpan(network: string, mask: string): Span | null {
  const base = Ipv4.network(network, mask)
  const length = Ipv4.prefixLength(mask)
  if (base === null || length === null) return null
  const size = 2 ** (32 - length)
  return size <= 2 ? { first: base, last: base + size - 1 } : { first: base + 1, last: base + size - 2 }
}

/** Addresses of `span` covered by the exclusions (overlapping ranges counted once). */
function excludedCount(dhcp: DhcpServerSettings, span: Span): number {
  const clipped: Span[] = []
  for (const range of dhcp.excludedRanges) {
    const start = Ipv4.parse(range.start)
    const end = Ipv4.parse(range.end)
    if (start === null || end === null) continue
    const first = Math.max(start, span.first)
    const last = Math.min(end, span.last)
    if (first <= last) clipped.push({ first, last })
  }
  clipped.sort((a, b) => a.first - b.first)
  let count = 0
  let covered = span.first - 1
  for (const part of clipped) {
    if (part.last <= covered) continue
    count += part.last - Math.max(part.first, covered + 1) + 1
    covered = part.last
  }
  return count
}

export class DhcpViews {
  static bindings(bindings: readonly DhcpBinding[]): string[] {
    const bound = bindings.filter((binding) => binding.state === 'bound')
    const sorted = [...bound].sort((a, b) => (Ipv4.parse(a.ip) ?? 0) - (Ipv4.parse(b.ip) ?? 0))
    return [...BINDING_HEADER, ...sorted.map((binding) => `${binding.ip.padEnd(17)}${ciscoMac(binding.mac).padEnd(25)}${'--'.padEnd(24)}Automatic`)]
  }

  static pools(dhcp: DhcpServerSettings, bindings: readonly DhcpBinding[], onlyPool: string | null): string[] {
    const lines: string[] = []
    for (const pool of dhcp.pools) {
      if (onlyPool !== null && pool.id !== onlyPool) continue
      const span = hostSpan(pool.network, pool.mask)
      const leasedIps = new Set(bindings.filter((binding) => binding.poolId === pool.id && binding.state === 'bound').map((binding) => binding.ip))
      const total = span === null ? 0 : span.last - span.first + 1
      const excluded = span === null ? 0 : excludedCount(dhcp, span)
      lines.push(
        '',
        `Pool ${pool.id} :`,
        ' Utilization mark (high/low)    : 100 / 0',
        ' Subnet size (first/next)       : 0 / 0',
        ` Total addresses                : ${total}`,
        ` Leased addresses               : ${leasedIps.size}`,
        ` Excluded addresses             : ${excluded}`,
        ' Pending event                  : none',
        '',
        ` ${span === null ? 0 : 1} subnet is currently in the pool`,
      )
      if (span === null) continue
      const current = DhcpPoolAllocator.pick(pool, '', leasedIps, dhcp.excludedRanges) ?? '0.0.0.0'
      const range = `${Ipv4.format(span.first).padEnd(17)}- ${Ipv4.format(span.last)}`
      const counts = `${String(leasedIps.size).padEnd(5)}/ ${String(excluded).padEnd(5)}/ ${total}`
      lines.push(
        ' Current index        IP address range                    Leased/Excluded/Total',
        ` ${current.padEnd(21)}${range.padEnd(36)}${counts}`,
      )
    }
    return lines
  }
}
