// The CLI of one device kind family (docs/CLI.md §4): the UI's single entry point. Stateless itself: every
// call takes the immutable session state, the current device (the lab's copy, so GUI edits show at once)
// and the environment, and returns a CliStep with the next state.
import type { Device, TerminalLine } from '../../domain'
import { localizedMessage } from '../../i18n/messageKeys'
import type { RequestRecord } from '../../sim/contract'
import type { CliCommandSet, CliControlKey, CliEnvironment, CliInputKind, CliSessionState, CliStep } from '../contract'
import { CONFIG_MODE_KINDS } from '../contract'
import { CliHelp } from './CliHelp'
import { CliHistory } from './CliHistory'
import { cliError, cliLog, cliMessage, cliText } from './CliOutput'
import { CliPager, DEFAULT_TERMINAL_LENGTH, MORE_PROMPT, type PagerKey } from './CliPager'
import { CliParser } from './CliParser'
import { CliPrompt, managementOf } from './CliPrompt'
import { CliRegistry } from './CliRegistry'
import { CliRunner, type RunOutcome } from './CliRunner'
import { CONFIGURED_LOG } from './commands/execCommands'
import { createCoreCommandSet } from './commands/coreCommandSet'
import { FactoryReset } from './FactoryReset'
import { RunningConfigGenerator } from './RunningConfigGenerator'

const MAX_LOGIN_ATTEMPTS = 3
const PASSWORD_PROMPT = 'Password: '

export class CliShell {
  private readonly registry: CliRegistry
  private readonly parser: CliParser
  private readonly helper: CliHelp
  private readonly runner: CliRunner
  private readonly generator: RunningConfigGenerator

  /** `sets` = the command sets besides the core one (switch, router, packs), in registration order. */
  constructor(sets: readonly CliCommandSet[] = []) {
    const core = createCoreCommandSet({
      body: (device) => this.runningConfig(device),
      show: (device) => this.generator.show(device),
      replay: (device, text) => this.replay(device, text),
      reload: (device) => this.reload(device),
    })
    this.registry = new CliRegistry([core, ...sets])
    this.parser = new CliParser(this.registry)
    this.helper = new CliHelp(this.parser)
    this.runner = new CliRunner(this.parser)
    this.generator = new RunningConfigGenerator(this.registry.sections(), this.registry.interfaceLines())
  }

  /** Starts a console session: banner, then the console password when the line asks for one. */
  open(device: Device): CliStep {
    const state: CliSessionState = {
      deviceId: device.id,
      mode: { kind: 'userExec' },
      phase: 'ready',
      history: { exec: [], config: [] },
      terminalLength: DEFAULT_TERMINAL_LENGTH,
      pending: null,
    }
    if (!device.powered) return this.poweredOff(state)
    return this.finish(this.welcome(CliRunner.start(state, device)))
  }

  /** Enter pressed: a command, an answer, a password, or "press RETURN". */
  submit(state: CliSessionState, device: Device, env: CliEnvironment, input: string): CliStep {
    if (!device.powered) return this.poweredOff(state)
    const start = CliRunner.start({ ...state, mode: CliRunner.validMode(device, state.mode) }, device)
    if (state.phase === 'pressReturn') return this.finish(this.welcome({ ...start, state: { ...start.state, phase: 'ready' } }))
    const pending = state.pending
    switch (pending?.kind) {
      case 'login':
        return this.finish(this.login(start, input, pending.failures))
      case 'question':
        return this.finish(this.runner.answer(start, env, input))
      case 'more':
        return this.pagerKey(state, device, 'enter')
      case 'job':
        return this.finish(start)
      case undefined:
        break
    }
    const prompt = CliPrompt.render(device, start.state.mode)
    const recorded = { ...start, state: CliHistory.record(start.state, input) }
    return this.finish(this.runner.execute(recorded, env, input, prompt.length))
  }

  /** `?` typed after `input`: the UI echoes `prompt + input + '?'`, prints the lines and keeps `input`. */
  help(state: CliSessionState, device: Device, input: string): CliStep {
    if (!this.acceptsCommand(state, device)) return this.step(state, device, [])
    const prompt = CliPrompt.render(device, state.mode)
    const output = this.helper.help(input, state.mode, device, prompt.length)
    const lines = output.error ? cliError(...output.lines) : cliText(...output.lines)
    const paged = CliPager.page(state, lines)
    return { ...this.step(paged.state, device, paged.lines), keepInput: input }
  }

  /** Tab: the input with its last word completed (unchanged when there is no unique completion). */
  complete(state: CliSessionState, device: Device, input: string): string {
    return this.acceptsCommand(state, device) ? this.helper.complete(input, state.mode, device) : input
  }

  /** A key at ` --More-- `. */
  pagerKey(state: CliSessionState, device: Device, key: PagerKey): CliStep {
    const paged = CliPager.key(state, key)
    return this.step(paged.state, device, paged.lines)
  }

  /** Ctrl+Z / Ctrl+C: cancel a question, stop paging, or leave config mode (like `end`). */
  control(state: CliSessionState, device: Device, key: CliControlKey): CliStep {
    const pending = state.pending
    if (pending?.kind === 'more') return this.pagerKey(state, device, 'quit')
    if (pending?.kind === 'login') return this.step({ ...state, pending: null, phase: 'pressReturn' }, device, [])
    if (pending?.kind === 'question' || (pending?.kind === 'job' && key === 'ctrlC')) return this.step({ ...state, pending: null }, device, [])
    if (pending === null && state.phase === 'ready' && CONFIG_MODE_KINDS.includes(state.mode.kind)) {
      return this.step({ ...state, mode: { kind: 'privilegedExec' } }, device, cliLog(CONFIGURED_LOG))
    }
    return this.step(state, device, [])
  }

  /** The job of step.job finished: its output and the next state. */
  resume(state: CliSessionState, device: Device, env: CliEnvironment, record: RequestRecord): CliStep {
    return this.finish(this.runner.finishJob(CliRunner.start(state, device), env, record))
  }

  /** History of the current mode group, oldest first (Up / Down arrows). */
  history(state: CliSessionState): readonly string[] {
    return CliHistory.of(state)
  }

  /** running-config of the device ('!' … 'end'): the Config tab, config export, `write memory`. */
  runningConfig(device: Device): string[] {
    return this.generator.body(device)
  }

  /** `show running-config` output (with "Building configuration…" and the size line). */
  showRunningConfig(device: Device): string[] {
    return this.generator.show(device)
  }

  /** Runs IOS config text (startup-config, a pasted config) in global config mode; errors are skipped. */
  replay(device: Device, text: string): Device {
    const env: CliEnvironment = { network: { devices: [device], links: [] }, runtime: undefined, now: 0 }
    let outcome = CliRunner.start(
      { deviceId: device.id, mode: { kind: 'globalConfig' }, phase: 'ready', history: { exec: [], config: [] }, terminalLength: 0, pending: null },
      device,
    )
    for (const raw of text.split('\n')) {
      const line = raw.replace(/\r$/, '')
      if (outcome.state.pending?.kind === 'question') {
        outcome = this.runner.answer(outcome, env, line)
        continue
      }
      const trimmed = line.trim()
      if (trimmed === 'end') break
      if (trimmed === '' || trimmed.startsWith('!')) continue
      const mode = CONFIG_MODE_KINDS.includes(outcome.state.mode.kind) ? outcome.state.mode : { kind: 'globalConfig' as const }
      outcome = this.runner.execute({ ...outcome, state: { ...outcome.state, mode, pending: null } }, env, line, 0)
    }
    return outcome.device
  }

  /** Factory configuration plus the startup-config. */
  reload(device: Device): Device {
    const reset = FactoryReset.of(device)
    const startup = managementOf(device).startupConfig
    return startup === undefined ? reset : this.replay(FactoryReset.interfacesUp(reset), startup)
  }

  private acceptsCommand(state: CliSessionState, device: Device): boolean {
    return device.powered && state.phase === 'ready' && state.pending === null
  }

  /** Banner, then the console password prompt when `line con 0` has `login` and a password. */
  private welcome(outcome: RunOutcome): RunOutcome {
    const management = managementOf(outcome.device)
    const consoleLine = management.lines?.console
    const banner = management.bannerMotd === undefined ? [] : cliText(...management.bannerMotd.split('\n'))
    const password = consoleLine?.password
    const needsLogin = consoleLine?.login === true && password !== undefined && password !== ''
    if (!needsLogin) return { ...outcome, lines: [...outcome.lines, ...banner] }
    return {
      ...outcome,
      state: { ...outcome.state, pending: { kind: 'login', failures: 0 } },
      lines: [...outcome.lines, ...banner, ...cliText('', 'User Access Verification', '')],
    }
  }

  private login(outcome: RunOutcome, answer: string, failures: number): RunOutcome {
    const password = managementOf(outcome.device).lines?.console?.password
    if (answer === password) return { ...outcome, state: { ...outcome.state, pending: null } }
    if (failures + 1 < MAX_LOGIN_ATTEMPTS) return { ...outcome, state: { ...outcome.state, pending: { kind: 'login', failures: failures + 1 } } }
    return { ...outcome, state: { ...outcome.state, pending: null, phase: 'pressReturn' }, lines: [...outcome.lines, ...cliError('% Bad passwords')] }
  }

  private finish(outcome: RunOutcome): CliStep {
    const paged = outcome.state.pending === null ? CliPager.page(outcome.state, outcome.lines) : { state: outcome.state, lines: outcome.lines }
    const step = this.step(paged.state, outcome.device, paged.lines)
    return {
      ...step,
      ...(outcome.changed ? { device: outcome.device } : {}),
      ...(outcome.job === undefined ? {} : { job: outcome.job }),
      ...(outcome.reloaded ? { reloaded: true } : {}),
    }
  }

  private step(state: CliSessionState, device: Device, lines: readonly TerminalLine[]): CliStep {
    const [prompt, input] = this.promptOf(state, device)
    return { state, lines, prompt, input }
  }

  private promptOf(state: CliSessionState, device: Device): [string, CliInputKind] {
    const pending = state.pending
    switch (pending?.kind) {
      case 'more':
        return [MORE_PROMPT, 'more']
      case 'question':
        return [pending.question.prompt, pending.question.secret ? 'secret' : 'text']
      case 'login':
        return [PASSWORD_PROMPT, 'secret']
      case 'job':
        return ['', 'busy']
      case undefined:
        return state.phase === 'pressReturn' ? ['', 'pressReturn'] : [CliPrompt.render(device, state.mode), 'command']
    }
  }

  private poweredOff(state: CliSessionState): CliStep {
    return { state, lines: [cliMessage(localizedMessage('cli:poweredOff'))], prompt: '', input: 'pressReturn' }
  }
}
