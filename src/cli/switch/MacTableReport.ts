// `show mac address-table` from the simulator's runtime (read only), Catalyst IOS layout.
import type { MacTableEntry } from '../../sim/contract'

export interface MacTableFilter {
  readonly type?: MacTableEntry['type']
  readonly vlan?: number
  readonly portId?: string
  /** 'AA:BB:CC:DD:EE:FF' */
  readonly mac?: string
}

/** 'AA:BB:CC:DD:EE:FF' → 'aabb.ccdd.eeff'. */
export function ciscoMac(mac: string): string {
  const hex = mac.replace(/[^0-9A-Fa-f]/g, '').toLowerCase()
  return [hex.slice(0, 4), hex.slice(4, 8), hex.slice(8, 12)].join('.')
}

export class MacTableReport {
  /** Entries still alive at `now` (lazy aging, docs/SIMULATION.md §4), sorted by VLAN and MAC. */
  static live(entries: readonly MacTableEntry[], now: number): MacTableEntry[] {
    return entries
      .filter((entry) => entry.expiresAt === null || entry.expiresAt > now)
      .sort((a, b) => a.vlan - b.vlan || a.mac.localeCompare(b.mac) || a.portId.localeCompare(b.portId))
  }

  static show(entries: readonly MacTableEntry[], now: number, filter: MacTableFilter): string[] {
    const shown = MacTableReport.live(entries, now).filter(
      (entry) =>
        (filter.type === undefined || entry.type === filter.type) &&
        (filter.vlan === undefined || entry.vlan === filter.vlan) &&
        (filter.portId === undefined || entry.portId === filter.portId) &&
        (filter.mac === undefined || entry.mac.toUpperCase() === filter.mac.toUpperCase()),
    )
    const rows = shown.map(
      (entry) => `${String(entry.vlan).padStart(4)}    ${ciscoMac(entry.mac)}    ${entry.type.toUpperCase().padEnd(12)}${entry.portId}`,
    )
    return [
      '          Mac Address Table',
      '-------------------------------------------',
      '',
      'Vlan    Mac Address       Type        Ports',
      '----    -----------       --------    -----',
      ...rows,
      `Total Mac Addresses for this criterion: ${shown.length}`,
    ]
  }
}
