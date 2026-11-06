// Mode navigation: enable / disable / configure terminal / exit / end / logout, plus `show history` and
// `terminal length` (docs/CLI.md §2).
import type { CliCommandRegistration, CliCommandResult, CliContext, CliMode, CliQuestion } from '../../contract'
import { CONFIG_MODE_KINDS, CONFIG_SUBMODE_KINDS, EXEC_MODE_KINDS } from '../../contract'
import { keyword, param } from '../CliNodes'
import { cliError, cliLog, cliText } from '../CliOutput'
import { managementOf } from '../CliPrompt'

export const CONFIGURED_LOG = '%SYS-5-CONFIG_I: Configured from console by console'
const CONFIG_BANNER = 'Enter configuration commands, one per line.  End with CNTL/Z.'
const MAX_PASSWORD_ATTEMPTS = 3
const MAX_TERMINAL_LENGTH = 512

const USER_EXEC: CliMode = { kind: 'userExec' }
const PRIVILEGED: CliMode = { kind: 'privilegedExec' }
const GLOBAL_CONFIG: CliMode = { kind: 'globalConfig' }

/** `enable` with a secret / password: three tries, like IOS. */
function enableQuestion(failures: number): CliQuestion {
  return {
    prompt: 'Password: ',
    secret: true,
    onAnswer: (answer, ctx): CliCommandResult => {
      const { enableSecret, enablePassword } = managementOf(ctx.device)
      const expected = enableSecret ?? enablePassword
      if (answer === expected) return { mode: PRIVILEGED }
      if (failures + 1 >= MAX_PASSWORD_ATTEMPTS) {
        return { lines: cliError(enableSecret === undefined ? '% Bad passwords' : '% Bad secrets', '') }
      }
      return { ask: enableQuestion(failures + 1) }
    },
  }
}

function enable(ctx: CliContext): CliCommandResult {
  if (ctx.mode.kind === 'privilegedExec') return {}
  const { enableSecret, enablePassword } = managementOf(ctx.device)
  return enableSecret === undefined && enablePassword === undefined ? { mode: PRIVILEGED } : { ask: enableQuestion(0) }
}

/** `exit` / `logout` in EXEC: the console session ends ("Press RETURN to get started."). */
function logout(ctx: CliContext): CliCommandResult {
  return {
    lines: cliText('', `${ctx.session.hostname} con0 is now available`, '', '', '', '', '', 'Press RETURN to get started.'),
    session: { kind: 'logout' },
  }
}

function enterConfig(): CliCommandResult {
  return { lines: cliText(CONFIG_BANNER), mode: GLOBAL_CONFIG }
}

/** `configure` without `terminal` asks where from (only the terminal is simulated). */
const configureQuestion: CliQuestion = {
  prompt: 'Configuring from terminal, memory, or network [terminal]? ',
  secret: false,
  onAnswer: (answer) => {
    const choice = answer.trim().toLowerCase()
    return choice === '' || 'terminal'.startsWith(choice) ? enterConfig() : { lines: cliError('?Must be "terminal", "memory" or "network"') }
  },
}

function configExit(ctx: CliContext): CliCommandResult {
  if (CONFIG_SUBMODE_KINDS.includes(ctx.mode.kind)) return { mode: GLOBAL_CONFIG }
  return { mode: PRIVILEGED, lines: cliLog(CONFIGURED_LOG) }
}

function end(): CliCommandResult {
  return { mode: PRIVILEGED, lines: cliLog(CONFIGURED_LOG) }
}

function showHistory(ctx: CliContext): CliCommandResult {
  return { lines: cliText(...ctx.session.history.map((entry) => `  ${entry}`)) }
}


export const execCommands: readonly CliCommandRegistration[] = [
  {
    modes: EXEC_MODE_KINDS,
    node: keyword('enable', 'Turn on privileged commands', { run: enable }),
  },
  {
    modes: ['privilegedExec'],
    node: keyword('disable', 'Turn off privileged commands', { run: () => ({ mode: USER_EXEC }) }),
  },
  {
    modes: EXEC_MODE_KINDS,
    node: keyword('exit', 'Exit from the EXEC', { run: logout }),
  },
  {
    modes: EXEC_MODE_KINDS,
    node: keyword('logout', 'Exit from the EXEC', { run: logout }),
  },
  {
    modes: ['privilegedExec'],
    node: keyword('configure', 'Enter configuration mode', {
      run: () => ({ ask: configureQuestion }),
      children: [keyword('terminal', 'Configure from the terminal', { run: enterConfig })],
    }),
  },
  {
    modes: ['globalConfig'],
    node: keyword('exit', 'Exit from configure mode', { run: configExit }),
  },
  {
    modes: CONFIG_SUBMODE_KINDS,
    node: keyword('exit', 'Exit from the current mode', { run: configExit }),
  },
  {
    modes: CONFIG_MODE_KINDS,
    node: keyword('end', 'Exit from configure mode', { run: end }),
  },
  {
    modes: EXEC_MODE_KINDS,
    node: keyword('show', 'Show running system information', {
      children: [keyword('history', 'Display the session command history', { run: showHistory })],
    }),
  },
  {
    modes: EXEC_MODE_KINDS,
    node: keyword('terminal', 'Set terminal line parameters', {
      children: [
        keyword('length', 'Set number of lines on a screen', {
          children: [
            param('length', { type: 'number', min: 0, max: MAX_TERMINAL_LENGTH }, 'Number of lines on screen (0 for no pausing)', {
              run: (ctx) => ({ session: { kind: 'terminalLength', length: ctx.args.number('length') } }),
            }),
          ],
        }),
      ],
    }),
  },
]
