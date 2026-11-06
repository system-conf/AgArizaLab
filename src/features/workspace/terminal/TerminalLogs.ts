import type { TerminalLine } from '../../../domain/EngineContract'

const NO_LINES: readonly TerminalLine[] = []

/**
 * Command prompt history of every device of the open lab (kept while the lab is open, not saved).
 * `cls` hides the lines shown so far without forgetting them. Immutable.
 */
export class TerminalLogs {
  private readonly lines: ReadonlyMap<string, readonly TerminalLine[]>
  private readonly hidden: ReadonlyMap<string, number>

  private constructor(lines: ReadonlyMap<string, readonly TerminalLine[]>, hidden: ReadonlyMap<string, number>) {
    this.lines = lines
    this.hidden = hidden
  }

  static empty(): TerminalLogs {
    return new TerminalLogs(new Map(), new Map())
  }

  linesOf(deviceId: string): readonly TerminalLine[] {
    return this.lines.get(deviceId) ?? NO_LINES
  }

  /** Lines hidden by `cls`, counted from the start. */
  hiddenCountOf(deviceId: string): number {
    return this.hidden.get(deviceId) ?? 0
  }

  append(deviceId: string, lines: readonly TerminalLine[]): TerminalLogs {
    const next = new Map(this.lines)
    next.set(deviceId, [...this.linesOf(deviceId), ...lines])
    return new TerminalLogs(next, this.hidden)
  }

  /** `cls`: hides everything shown so far on that device. */
  clear(deviceId: string): TerminalLogs {
    const hidden = new Map(this.hidden)
    hidden.set(deviceId, this.linesOf(deviceId).length)
    return new TerminalLogs(this.lines, hidden)
  }
}
