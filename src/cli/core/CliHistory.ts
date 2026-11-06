// Command history: EXEC and config commands are kept apart, 10 each (IOS `terminal history size` default).
import type { CliSessionState } from '../contract'
import { EXEC_MODE_KINDS } from '../contract'

export const HISTORY_SIZE = 10

export class CliHistory {
  /** History of the state's mode group, oldest first (the UI's Up arrow walks it backwards). */
  static of(state: CliSessionState): readonly string[] {
    return EXEC_MODE_KINDS.includes(state.mode.kind) ? state.history.exec : state.history.config
  }

  /** The state with `line` appended to its mode group's history. */
  static record(state: CliSessionState, line: string): CliSessionState {
    const entry = line.trim()
    if (entry === '') return state
    const exec = EXEC_MODE_KINDS.includes(state.mode.kind)
    const list = exec ? state.history.exec : state.history.config
    const next = [...list, entry].slice(-HISTORY_SIZE)
    return { ...state, history: exec ? { ...state.history, exec: next } : { ...state.history, config: next } }
  }
}
