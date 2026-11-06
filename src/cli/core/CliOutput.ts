// Builders for CLI output lines. Device output is English text and never translated (docs/I18N.md);
// app hints around it are LocalizedMessages of the `cli` namespace.
import type { LocalizedMessage } from '../../domain/Messages'
import type { TerminalLine } from '../../domain'

/** Plain device output, one line per string. */
export function cliText(...lines: readonly string[]): TerminalLine[] {
  return lines.map((text) => ({ kind: 'output', text }))
}

/** IOS error output ('% Incomplete command.'): shown like device text, styled as an error. */
export function cliError(...lines: readonly string[]): TerminalLine[] {
  return lines.map((text) => ({ kind: 'error', text }))
}

/** Syslog-style messages ('%LINK-5-CHANGED: …', '%SYS-5-CONFIG_I: …'). */
export function cliLog(...lines: readonly string[]): TerminalLine[] {
  return lines.map((text) => ({ kind: 'info', text }))
}

/** An app hint (translated by the UI), e.g. localizedMessage('cli:poweredOff'). */
export function cliMessage(message: LocalizedMessage): TerminalLine {
  return { kind: 'info', message }
}
