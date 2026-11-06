// `ipconfig /displaydns` and `ipconfig /flushdns` on a Windows host (docs/CLI.md §7, C4): the resolver cache
// the simulator keeps per device (ServiceRuntime.dnsCache, filled by name lookups before ping / tracert).
import type { DnsCacheEntry } from '../../sim/contract'

/** A record of Type 1 (A) holds an IPv4 address: 4 bytes. */
const A_RECORD_TYPE = 1
const A_RECORD_LENGTH = 4
const RULE = '----------------------------------------'
const LABEL_WIDTH = 22
const INDENT = '    '

/** "Record Name . . . . . : " / "Time To Live  . . . . : ": the dots stay on even columns, as Windows prints them. */
function field(label: string, value: string | number): string {
  let padded = label
  for (let column = label.length; column < LABEL_WIDTH; column += 1) padded += column % 2 === 0 && column > label.length ? '.' : ' '
  return `${INDENT}${padded}: ${value}`
}

export class DnsCacheView {
  /** Entries still alive at `now` (lazy aging like the simulator), in the order they were cached. */
  static live(entries: readonly DnsCacheEntry[], now: number): DnsCacheEntry[] {
    return entries.filter((entry) => entry.expiresAt > now)
  }

  /** Windows' layout: one block per name; a negative answer prints "Name does not exist.". */
  static displayLines(entries: readonly DnsCacheEntry[], now: number): string[] {
    const lines = ['', 'Windows IP Configuration', '']
    for (const entry of DnsCacheView.live(entries, now)) {
      lines.push(`${INDENT}${entry.name}`, `${INDENT}${RULE}`)
      if (entry.address === null) {
        lines.push(`${INDENT}Name does not exist.`, '', '')
        continue
      }
      lines.push(
        field('Record Name', entry.name),
        field('Record Type', A_RECORD_TYPE),
        field('Time To Live', Math.max(0, Math.ceil((entry.expiresAt - now) / 1000))),
        field('Data Length', A_RECORD_LENGTH),
        field('Section', 'Answer'),
        field('A (Host) Record', entry.address),
        '',
        '',
      )
    }
    return lines
  }

  static flushedLines(): string[] {
    return ['', 'Windows IP Configuration', '', 'Successfully flushed the DNS Resolver Cache.']
  }
}
