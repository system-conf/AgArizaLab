// ` --More-- ` paging (docs/CLI.md §4.3): output longer than the terminal is shown one page at a time.
import type { TerminalLine } from '../../domain'
import type { CliPending, CliSessionState } from '../contract'

export const DEFAULT_TERMINAL_LENGTH = 24
export const MORE_PROMPT = ' --More-- '

/** The key pressed at ` --More-- `: Space = next page, Enter = next line, anything else = stop. */
export type PagerKey = 'space' | 'enter' | 'quit'

export interface Paged {
  readonly state: CliSessionState
  readonly lines: readonly TerminalLine[]
}

export class CliPager {
  /** Shows what fits and keeps the rest as a ` --More-- ` pending in front of the state's pending. */
  static page(state: CliSessionState, lines: readonly TerminalLine[]): Paged {
    const size = CliPager.pageSize(state)
    if (size === null || lines.length <= size) return { state, lines }
    const more: CliPending = { kind: 'more', lines: lines.slice(size), then: state.pending }
    return { state: { ...state, pending: more }, lines: lines.slice(0, size) }
  }

  static key(state: CliSessionState, key: PagerKey): Paged {
    const pending = state.pending
    if (pending?.kind !== 'more') return { state, lines: [] }
    if (key === 'quit') return { state: { ...state, pending: pending.then }, lines: [] }
    const count = key === 'enter' ? 1 : (CliPager.pageSize(state) ?? pending.lines.length)
    const shown = pending.lines.slice(0, count)
    const rest = pending.lines.slice(count)
    const next: CliPending | null = rest.length === 0 ? pending.then : { ...pending, lines: rest }
    return { state: { ...state, pending: next }, lines: shown }
  }

  /** Lines per page (the last terminal line holds ` --More-- `); null = no paging (`terminal length 0`). */
  private static pageSize(state: CliSessionState): number | null {
    return state.terminalLength <= 0 ? null : Math.max(1, state.terminalLength - 1)
  }
}
