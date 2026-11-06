// Builders for terminal lines shared by the command formatters.
import type { TerminalLine, TerminalLineKind } from '../domain'
import type { LocalizedMessage } from '../domain/Messages'

/** Device output (English, never translated), one line per string. */
export function textLines(lines: readonly string[], kind: TerminalLineKind = 'output'): TerminalLine[] {
  return lines.map((text) => ({ kind, text }))
}

/** One app message around the device output, translated by the UI. */
export function messageLine(message: LocalizedMessage, kind: TerminalLineKind = 'error'): TerminalLine {
  return { kind, message }
}
