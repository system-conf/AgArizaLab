// Matches one parameter of the command tree against the next token(s) of a line.
import type { Device } from '../../domain'
import { Ipv4 } from '../../net/Ipv4'
import type { CliParamSpec, CliValue } from '../contract'
import type { CliToken } from './CliTokenizer'
import { InterfaceNames } from './InterfaceNames'

export type ParamMatch =
  /** `consumed` tokens make the value. */
  | { readonly kind: 'ok'; readonly value: CliValue; readonly consumed: number }
  /** The token is not this parameter (the parser reports the caret at the token). */
  | { readonly kind: 'noMatch' }
  /** Looks like this parameter but is wrong at character `at` of the line. */
  | { readonly kind: 'invalid'; readonly at: number }
  /** A valid start that needs another token (an interface type without its number). */
  | { readonly kind: 'incomplete' }

const MAX_VLAN = 4094
const MAC_DOTTED = /^([0-9a-f]{4})\.([0-9a-f]{4})\.([0-9a-f]{4})$/i
const MAC_SEPARATED = /^[0-9a-f]{2}([:-][0-9a-f]{2}){5}$/i

/** The `?` label of a parameter (left column). Interfaces are listed per type by CliHelp instead. */
export function paramLabel(spec: CliParamSpec): string {
  switch (spec.type) {
    case 'word':
      return spec.label ?? 'WORD'
    case 'number':
      return `<${spec.min}-${spec.max}>`
    case 'ipv4':
      return 'A.B.C.D'
    case 'mac':
      return 'H.H.H'
    case 'line':
      return spec.label ?? 'LINE'
    case 'interface':
    case 'interfaceRange':
      return 'WORD'
    case 'vlanList':
      return `<1-${MAX_VLAN}>`
  }
}

export class CliParamMatcher {
  /** Matches `spec` at `tokens[index]` of `line` on `device`. */
  static match(spec: CliParamSpec, line: string, tokens: readonly CliToken[], index: number, device: Device): ParamMatch {
    const token = tokens[index]
    if (token === undefined) return { kind: 'noMatch' }
    switch (spec.type) {
      case 'word':
        return { kind: 'ok', value: token.text, consumed: 1 }
      case 'number':
        return CliParamMatcher.number(token, spec.min, spec.max)
      case 'ipv4':
        return CliParamMatcher.ipv4(token)
      case 'mac':
        return CliParamMatcher.mac(token)
      case 'line':
        return { kind: 'ok', value: line.slice(token.start).trimEnd(), consumed: tokens.length - index }
      case 'interface':
        return CliParamMatcher.interfaceName(tokens, index, device)
      case 'interfaceRange':
        return CliParamMatcher.interfaceRange(line, tokens, index, device)
      case 'vlanList':
        return CliParamMatcher.vlanList(token)
    }
  }

  /** Normalized MAC 'AA:BB:CC:DD:EE:FF' of 'aabb.ccdd.eeff', 'aa:bb:…' or 'aa-bb-…'; null when invalid. */
  static parseMac(text: string): string | null {
    const dotted = MAC_DOTTED.exec(text)
    const hex = dotted !== null ? dotted.slice(1).join('') : MAC_SEPARATED.test(text) ? text.replace(/[:-]/g, '') : null
    if (hex === null) return null
    return (hex.toUpperCase().match(/.{2}/g) ?? []).join(':')
  }

  /** '10', '10,20,30-35' → sorted unique ids; null when invalid. */
  static parseVlanList(text: string): number[] | null {
    const ids = new Set<number>()
    for (const part of text.split(',')) {
      const [, first, last] = /^(\d+)(?:-(\d+))?$/.exec(part) ?? []
      if (first === undefined) return null
      const start = Number(first)
      const end = last === undefined ? start : Number(last)
      if (start < 1 || end > MAX_VLAN || end < start) return null
      for (let id = start; id <= end; id += 1) ids.add(id)
    }
    return [...ids].sort((a, b) => a - b)
  }

  private static number(token: CliToken, min: number, max: number): ParamMatch {
    if (!/^\d+$/.test(token.text)) return { kind: 'noMatch' }
    const value = Number(token.text)
    return value >= min && value <= max ? { kind: 'ok', value, consumed: 1 } : { kind: 'invalid', at: token.start }
  }

  private static ipv4(token: CliToken): ParamMatch {
    const value = Ipv4.parse(token.text)
    if (value !== null) return { kind: 'ok', value: Ipv4.format(value), consumed: 1 }
    return /^[\d.]+$/.test(token.text) ? { kind: 'invalid', at: token.start } : { kind: 'noMatch' }
  }

  private static mac(token: CliToken): ParamMatch {
    const mac = CliParamMatcher.parseMac(token.text)
    return mac === null ? { kind: 'noMatch' } : { kind: 'ok', value: mac, consumed: 1 }
  }

  private static vlanList(token: CliToken): ParamMatch {
    if (!/^[\d,-]+$/.test(token.text)) return { kind: 'noMatch' }
    const ids = CliParamMatcher.parseVlanList(token.text)
    return ids === null ? { kind: 'invalid', at: token.start } : { kind: 'ok', value: ids, consumed: 1 }
  }

  /** 'g0/0' (one token) or 'gigabitEthernet 0/0' (two tokens). */
  private static interfaceName(tokens: readonly CliToken[], index: number, device: Device): ParamMatch {
    const token = tokens[index]
    if (token === undefined) return { kind: 'noMatch' }
    const allowed = InterfaceNames.typesOf(device)
    const joined = InterfaceNames.parse(token.text, allowed)
    if (joined !== null) return { kind: 'ok', value: joined, consumed: 1 }
    if (!/^[A-Za-z-]+$/.test(token.text)) {
      return /^[A-Za-z-]+\d/.test(token.text) && InterfaceNames.matchType(token.text.replace(/\d.*$/, ''), allowed).ok
        ? { kind: 'invalid', at: token.start }
        : { kind: 'noMatch' }
    }
    if (!InterfaceNames.matchType(token.text, allowed).ok) return { kind: 'noMatch' }
    const next = tokens[index + 1]
    if (next === undefined) return { kind: 'incomplete' }
    const split = InterfaceNames.parse(`${token.text}${next.text}`, allowed)
    return split === null ? { kind: 'invalid', at: next.start } : { kind: 'ok', value: split, consumed: 2 }
  }

  private static interfaceRange(line: string, tokens: readonly CliToken[], index: number, device: Device): ParamMatch {
    const token = tokens[index]
    if (token === undefined) return { kind: 'noMatch' }
    const text = line.slice(token.start).trimEnd()
    const allowed = InterfaceNames.typesOf(device)
    if (/^[A-Za-z-]+$/.test(text) && InterfaceNames.matchType(text, allowed).ok) return { kind: 'incomplete' }
    const parsed = InterfaceNames.parseRange(text, allowed)
    if (!parsed.ok) return { kind: 'invalid', at: token.start + parsed.errorAt }
    return { kind: 'ok', value: parsed.names, consumed: tokens.length - index }
  }
}
