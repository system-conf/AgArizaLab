import type { Device, TerminalLine } from '../../../domain'
import type { CliControlKey, CliInputKind, CliSessionState, CliShell, CliStep } from '../cliServices'

/** Older lines are dropped beyond this many (a long session must not grow without end). */
export const MAX_CONSOLE_LINES = 2000

const CONTROL_ECHO: Readonly<Record<CliControlKey, string>> = { ctrlZ: '^Z', ctrlC: '^C' }

/**
 * One device's console window (docs/CLI.md §4): the shell session, the transcript on screen and how the
 * next input is read. Immutable: every method returns a new console. The shell never echoes input, so
 * the echo of what the user typed (`prompt + input`) is added here the way IOS shows it.
 */
export class CliConsole {
  readonly session: CliSessionState
  readonly lines: readonly TerminalLine[]
  /** Text before the input: 'R1#', 'Password: ', ' --More-- ', ''. */
  readonly prompt: string
  readonly input: CliInputKind
  /** Whether the device was powered when the console was (re)opened; a change opens it again. */
  readonly powered: boolean

  private constructor(session: CliSessionState, lines: readonly TerminalLine[], prompt: string, input: CliInputKind, powered: boolean) {
    this.session = session
    this.lines = lines
    this.prompt = prompt
    this.input = input
    this.powered = powered
  }

  /** A new session on `device` (banner, console password); `previous` keeps its transcript above it. */
  static open(shell: CliShell, device: Device, previous?: CliConsole): CliConsole {
    const step = shell.open(device)
    return new CliConsole(step.state, CliConsole.capped([...(previous?.lines ?? []), ...step.lines]), step.prompt, step.input, device.powered)
  }

  /** The screen after `step`: the echo, the shell's output, then `notes` (app hints such as a lock). */
  after(step: CliStep, echo: readonly TerminalLine[], notes: readonly TerminalLine[] = [], prompt: string = step.prompt): CliConsole {
    const lines = CliConsole.capped([...this.lines, ...echo, ...step.lines, ...notes])
    return new CliConsole(step.state, lines, prompt, step.input, this.powered)
  }

  /** Echo of a submitted line: passwords show only the prompt, the pager and a running job nothing. */
  submitEcho(text: string): TerminalLine[] {
    switch (this.input) {
      case 'secret':
        return [CliConsole.echo(this.prompt)]
      case 'more':
      case 'busy':
        return []
      case 'command':
      case 'text':
      case 'pressReturn':
        return [CliConsole.echo(this.prompt + text)]
    }
  }

  /** Echo of `?` typed after `text` (IOS prints the line with the question mark). */
  helpEcho(text: string): TerminalLine[] {
    return [CliConsole.echo(`${this.prompt}${text}?`)]
  }

  /** Echo of Ctrl+Z / Ctrl+C: the line so far and '^Z' / '^C'. */
  controlEcho(text: string, key: CliControlKey): TerminalLine[] {
    if (this.input === 'more' || this.input === 'busy') return [CliConsole.echo(CONTROL_ECHO[key])]
    return [CliConsole.echo(`${this.prompt}${this.input === 'secret' ? '' : text}${CONTROL_ECHO[key]}`)]
  }

  /** The same session with an empty screen. */
  cleared(): CliConsole {
    return new CliConsole(this.session, [], this.prompt, this.input, this.powered)
  }

  private static echo(text: string): TerminalLine {
    return { kind: 'input', text }
  }

  private static capped(lines: readonly TerminalLine[]): readonly TerminalLine[] {
    return lines.length > MAX_CONSOLE_LINES ? lines.slice(lines.length - MAX_CONSOLE_LINES) : lines
  }
}
