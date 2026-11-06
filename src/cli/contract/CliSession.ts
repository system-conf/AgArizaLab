// Session API the UI drives (docs/CLI.md §4). The session is an immutable state value; CliShell turns
// (state, device, environment, input) into a CliStep with the next state. Nothing is mutated.
import type { Device, TerminalLine } from '../../domain'
import type { SimRequest } from '../../sim/contract'
import type { CliArgsReader, CliJob, CliQuestion } from './CliCommandTree'
import type { CliMode } from './CliModes'

/** How the UI reads the next input. */
export type CliInputKind =
  /** A command line: Enter → submit, '?' → help, Tab → complete, Ctrl+Z / Ctrl+C → control. */
  | 'command'
  /** A password: do not echo the typed text; '?' is an ordinary character. */
  | 'secret'
  /** The answer to a question ("[confirm]", "Destination filename [startup-config]?"). */
  | 'text'
  /** ` --More-- `: the next single key goes to pagerKey (no echo, no Enter). */
  | 'more'
  /** "Press RETURN to get started.": any submit continues. */
  | 'pressReturn'
  /** A simulator request runs (step.job); call resume with its record. Typing is disabled. */
  | 'busy'

/** EXEC and config commands have separate histories, like IOS (10 entries each). */
export interface CliHistoryState {
  readonly exec: readonly string[]
  readonly config: readonly string[]
}

/** Where a question or job continues: the parse of the command that asked. */
export interface CliResumePoint {
  readonly mode: CliMode
  readonly args: CliArgsReader
  readonly path: readonly string[]
  readonly negated: boolean
}

export type CliPending =
  | { readonly kind: 'question'; readonly question: CliQuestion; readonly resume: CliResumePoint }
  | { readonly kind: 'job'; readonly job: CliJob; readonly resume: CliResumePoint }
  /** Output still to page; `then` = what waits after the last page. */
  | { readonly kind: 'more'; readonly lines: readonly TerminalLine[]; readonly then: CliPending | null }
  /** Console line password (`line con 0` + `login` + `password`). `enable` asks with a CliQuestion. */
  | { readonly kind: 'login'; readonly failures: number }

/**
 * One console session on one device. Immutable but not JSON-serializable (questions and jobs keep
 * their continuations): keep it in memory (React state / ref), never in the lab.
 */
export interface CliSessionState {
  readonly deviceId: string
  readonly mode: CliMode
  /** 'pressReturn' after `exit` / `logout` / reload until the user presses Enter. */
  readonly phase: 'ready' | 'pressReturn'
  readonly history: CliHistoryState
  /** `terminal length`; 0 = no paging. Default 24. */
  readonly terminalLength: number
  readonly pending: CliPending | null
}

/** Result of every CliShell call. */
export interface CliStep {
  readonly state: CliSessionState
  /**
   * Output after the input line. Never contains the echo of what the user typed: the UI prints
   * `prompt + input` itself (for help: `prompt + input + '?'`; for secrets: only the prompt).
   */
  readonly lines: readonly TerminalLine[]
  /** The device after the command; the UI applies it to the lab (GUI and CLI stay in sync). */
  readonly device?: Device
  /** A simulator request to run now; then call CliShell.resume with its finished record. */
  readonly job?: SimRequest
  /** Text before the next input: 'R1#', 'R1(config-if)#', 'Password: ', ' --More-- ', ''. */
  readonly prompt: string
  readonly input: CliInputKind
  /** Text to put back into the input field (after `word?` help and Tab). */
  readonly keepInput?: string
  /** The device was reloaded (`reload`): the UI restarts the device's simulator runtime. */
  readonly reloaded?: boolean
}

/** Control keys the shell understands. */
export type CliControlKey = 'ctrlZ' | 'ctrlC'
