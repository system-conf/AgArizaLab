// VLAN id lists as IOS prints and edits them: '1,10,20-25', `switchport trunk allowed vlan add|remove|except`.
import type { SwitchportSettings } from '../../domain'

export const MIN_VLAN = 1
export const MAX_VLAN = 4094

/** Shortest run IOS prints as a range ('10-12'); shorter runs are listed ('10,11'). */
const MIN_RANGE_RUN = 3

export type AllowedVlans = SwitchportSettings['allowedVlans']

export class VlanLists {
  /** Sorted, unique, inside 1..4094. */
  static normalize(ids: readonly number[]): number[] {
    return [...new Set(ids)].filter((id) => Number.isInteger(id) && id >= MIN_VLAN && id <= MAX_VLAN).sort((a, b) => a - b)
  }

  /** '1,10,20-25' (IOS form); '' for an empty list. */
  static compress(ids: readonly number[]): string {
    const sorted = VlanLists.normalize(ids)
    const parts: string[] = []
    let index = 0
    while (index < sorted.length) {
      const first = sorted[index] ?? 0
      let end = index
      while (end + 1 < sorted.length && sorted[end + 1] === (sorted[end] ?? 0) + 1) end += 1
      const last = sorted[end] ?? first
      if (end - index + 1 >= MIN_RANGE_RUN) parts.push(`${first}-${last}`)
      else for (let at = index; at <= end; at += 1) parts.push(String(sorted[at]))
      index = end + 1
    }
    return parts.join(',')
  }

  /** Every VLAN a trunk carries: 'all' = 1..4094. */
  static expand(allowed: AllowedVlans): number[] {
    if (allowed !== 'all') return VlanLists.normalize(allowed)
    return Array.from({ length: MAX_VLAN - MIN_VLAN + 1 }, (_, offset) => MIN_VLAN + offset)
  }

  /** The model's form of an allowed list: 'all' when it holds every VLAN. */
  static allowed(ids: readonly number[]): AllowedVlans {
    const normalized = VlanLists.normalize(ids)
    return normalized.length === MAX_VLAN - MIN_VLAN + 1 ? 'all' : normalized
  }

  static add(allowed: AllowedVlans, ids: readonly number[]): AllowedVlans {
    return allowed === 'all' ? 'all' : VlanLists.allowed([...allowed, ...ids])
  }

  static remove(allowed: AllowedVlans, ids: readonly number[]): AllowedVlans {
    const removed = new Set(ids)
    return VlanLists.allowed(VlanLists.expand(allowed).filter((id) => !removed.has(id)))
  }

  /** `except`: every VLAN but these. */
  static except(ids: readonly number[]): AllowedVlans {
    return VlanLists.remove('all', ids)
  }

  /** IOS text of an allowed list: '1-4094' for all, 'none' for none. */
  static describe(allowed: AllowedVlans): string {
    if (allowed === 'all') return `${MIN_VLAN}-${MAX_VLAN}`
    return allowed.length === 0 ? 'none' : VlanLists.compress(allowed)
  }
}
