// VLAN numbers and IOS-style VLAN lists ("1,10-20") for switchport and SSID forms.
import type { LocalizedMessage } from '../../../domain/Messages'
import { localizedMessage } from '../../../i18n/messageKeys'
import { parseWholeNumber } from './formTypes'

export const MIN_VLAN = 1
export const MAX_VLAN = 4094

export type VlanListResult = { ok: true; vlans: number[] } | { ok: false; error: LocalizedMessage }

const RANGE_PATTERN = /^(\d+)\s*-\s*(\d+)$/

export class VlanListParser {
  /** VLAN id 1..4094, or null. */
  static parseId(text: string): number | null {
    return parseWholeNumber(text, MIN_VLAN, MAX_VLAN)
  }

  static idError(text: string): LocalizedMessage | undefined {
    return VlanListParser.parseId(text) === null ? localizedMessage('deviceConfig:errors.vlanRange') : undefined
  }

  /** "1,10-20" → [1, 10, 11, …, 20] (sorted, without duplicates). */
  static parse(text: string): VlanListResult {
    const listError: VlanListResult = { ok: false, error: localizedMessage('deviceConfig:errors.vlanList') }
    if (text.trim() === '') return listError
    const vlans = new Set<number>()
    for (const raw of text.split(',')) {
      const part = raw.trim()
      const range = RANGE_PATTERN.exec(part)
      if (range) {
        const first = VlanListParser.parseId(range[1] ?? '')
        const last = VlanListParser.parseId(range[2] ?? '')
        if (first === null || last === null) return { ok: false, error: localizedMessage('deviceConfig:errors.vlanRange') }
        if (first > last) return { ok: false, error: localizedMessage('deviceConfig:errors.vlanListOrder', { part }) }
        for (let vlan = first; vlan <= last; vlan += 1) vlans.add(vlan)
        continue
      }
      if (!/^\d+$/.test(part)) return listError
      const vlan = VlanListParser.parseId(part)
      if (vlan === null) return { ok: false, error: localizedMessage('deviceConfig:errors.vlanRange') }
      vlans.add(vlan)
    }
    return { ok: true, vlans: [...vlans].sort((a, b) => a - b) }
  }

  /** [1, 10, 11, 12, 30] → "1,10-12,30". */
  static format(vlans: readonly number[]): string {
    const sorted = [...new Set(vlans)].sort((a, b) => a - b)
    const parts: string[] = []
    let start: number | undefined
    let previous: number | undefined
    const flush = () => {
      if (start === undefined || previous === undefined) return
      parts.push(start === previous ? `${start}` : `${start}-${previous}`)
    }
    for (const vlan of sorted) {
      if (previous !== undefined && vlan === previous + 1) {
        previous = vlan
        continue
      }
      flush()
      start = vlan
      previous = vlan
    }
    flush()
    return parts.join(',')
  }
}
