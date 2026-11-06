// IOS interface names: 'g0/0', 'gig 0/0', 'GigabitEthernet0/0.10' ↔ the lab's short port ids ('Gi0/0').
import type { Device } from '../../domain'
import type { CliInterfaceName } from '../contract'

export interface InterfaceType {
  /** IOS type name. */
  readonly name: string
  /** Prefix of the lab's short port ids. */
  readonly short: string
  /** Right column of `interface ?`. */
  readonly help: string
}

/** Known interface types, in the order IOS lists them. Packs add Loopback, Port-channel, Tunnel. */
export const INTERFACE_TYPES: readonly InterfaceType[] = [
  { name: 'Ethernet', short: 'Et', help: 'IEEE 802.3' },
  { name: 'FastEthernet', short: 'Fa', help: 'FastEthernet IEEE 802.3' },
  { name: 'GigabitEthernet', short: 'Gi', help: 'GigabitEthernet IEEE 802.3z' },
  { name: 'TenGigabitEthernet', short: 'Te', help: 'Ten Gigabit Ethernet' },
  { name: 'Serial', short: 'Se', help: 'Serial' },
  { name: 'Vlan', short: 'Vlan', help: 'Catalyst Vlans' },
]

const VLAN_TYPE = 'Vlan'
const MAX_VLAN = 4094
const NAME_PATTERN = /^([A-Za-z-]+)\s*(\d+(?:\/\d+)*)(?:\.(\d+))?$/
const NUMBER_PATTERN = /^\d+(?:\/\d+)*(?:\.\d+)?$/
const RANGE_PART_PATTERN = /^([A-Za-z-]+)\s*(\d+(?:\/\d+)*)\s*(?:-\s*(\d+))?$/

export type TypeMatch = { readonly ok: true; readonly type: InterfaceType } | { readonly ok: false; readonly ambiguous: boolean }

export class InterfaceNames {
  /** The type whose name starts with `prefix` (case-insensitive) among `allowed` (default: all). */
  static matchType(prefix: string, allowed: readonly InterfaceType[] = INTERFACE_TYPES): TypeMatch {
    const lower = prefix.toLowerCase()
    const exact = allowed.find((type) => type.name.toLowerCase() === lower)
    if (exact !== undefined) return { ok: true, type: exact }
    const matches = allowed.filter((type) => type.name.toLowerCase().startsWith(lower))
    const [only] = matches
    if (matches.length === 1 && only !== undefined) return { ok: true, type: only }
    return { ok: false, ambiguous: matches.length > 1 }
  }

  /** True when `text` looks like the number part of a name ('0/0', '0/0/1', '10', '0/0.10'). */
  static isNumber(text: string): boolean {
    return NUMBER_PATTERN.test(text)
  }

  /** Parses one name ('g0/0', 'GigabitEthernet 0/0', 'vlan10', 'fa0/1.10'); null = not a valid name. */
  static parse(text: string, allowed: readonly InterfaceType[] = INTERFACE_TYPES): CliInterfaceName | null {
    const match = NAME_PATTERN.exec(text.trim())
    const [, prefix, number, sub] = match ?? []
    if (prefix === undefined || number === undefined) return null
    const typeMatch = InterfaceNames.matchType(prefix, allowed)
    if (!typeMatch.ok) return null
    return InterfaceNames.build(typeMatch.type, number, sub === undefined ? undefined : Number(sub))
  }

  /** A name from a matched type and its number text; null when the numbers are invalid for the type. */
  static build(type: InterfaceType, number: string, subInterface?: number): CliInterfaceName | null {
    if (type.name === VLAN_TYPE) {
      const vlan = Number(number)
      if (!/^\d+$/.test(number) || vlan < 1 || vlan > MAX_VLAN || subInterface !== undefined) return null
      return { type: type.name, number: String(vlan), id: `Vlan${vlan}`, longName: `Vlan${vlan}` }
    }
    const subText = subInterface === undefined ? '' : `.${subInterface}`
    return {
      type: type.name,
      number,
      ...(subInterface === undefined ? {} : { subInterface }),
      id: `${type.short}${number}${subText}`,
      longName: `${type.name}${number}${subText}`,
    }
  }

  /** Long IOS name of a lab interface id: 'Gi0/0' → 'GigabitEthernet0/0'; unknown ids stay as they are. */
  static longName(id: string): string {
    return InterfaceNames.parse(id)?.longName ?? id
  }

  /** Same id? Compares normalized names ('gi0/0' = 'Gi0/0'). */
  static sameId(a: string, b: string): boolean {
    return (InterfaceNames.parse(a)?.id ?? a) === (InterfaceNames.parse(b)?.id ?? b)
  }

  /** Interface types the device has: those of its switched / routed ports, plus Vlan with a VLAN database. */
  static typesOf(device: Device): InterfaceType[] {
    const names = new Set<string>()
    for (const port of device.ports) {
      if (port.role !== 'switched' && port.role !== 'routed') continue
      const parsed = InterfaceNames.parse(port.id)
      if (parsed !== null) names.add(parsed.type)
    }
    if (device.switching !== undefined) names.add(VLAN_TYPE)
    return INTERFACE_TYPES.filter((type) => names.has(type.name))
  }

  /**
   * An interface range: 'fa0/1 - 5 , fa0/7', 'g0/1-2', 'vlan 10 - 12'. Returns the names in order, or the
   * index (in `text`) of the first part that is not valid.
   */
  static parseRange(
    text: string,
    allowed: readonly InterfaceType[] = INTERFACE_TYPES,
  ): { readonly ok: true; readonly names: CliInterfaceName[] } | { readonly ok: false; readonly errorAt: number } {
    const names: CliInterfaceName[] = []
    let offset = 0
    for (const part of text.split(',')) {
      const errorAt = offset + (part.length - part.trimStart().length)
      offset += part.length + 1
      const expanded = InterfaceNames.expandPart(part.trim(), allowed)
      if (expanded === null) return { ok: false, errorAt }
      names.push(...expanded)
    }
    return names.length === 0 ? { ok: false, errorAt: 0 } : { ok: true, names }
  }

  private static expandPart(part: string, allowed: readonly InterfaceType[]): CliInterfaceName[] | null {
    const [, prefix, number, last] = RANGE_PART_PATTERN.exec(part) ?? []
    if (prefix === undefined || number === undefined) return null
    const typeMatch = InterfaceNames.matchType(prefix, allowed)
    if (!typeMatch.ok) return null
    const slashAt = number.lastIndexOf('/')
    const head = number.slice(0, slashAt + 1)
    const first = Number(number.slice(slashAt + 1))
    const end = last === undefined ? first : Number(last)
    if (end < first) return null
    const names: CliInterfaceName[] = []
    for (let value = first; value <= end; value += 1) {
      const name = InterfaceNames.build(typeMatch.type, `${head}${value}`)
      if (name === null) return null
      names.push(name)
    }
    return names
  }
}
