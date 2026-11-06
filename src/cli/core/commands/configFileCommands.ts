// running-config / startup-config: show, copy, write, erase, reload (docs/CLI.md §5).
import type { Device } from '../../../domain'
import { localizedMessage } from '../../../i18n/messageKeys'
import type { CliCommandRegistration, CliCommandResult, CliContext, CliQuestion } from '../../contract'
import { keyword } from '../CliNodes'
import { cliError, cliLog, cliMessage, cliText } from '../CliOutput'
import { managementOf } from '../CliPrompt'
import { DeviceEdits } from '../DeviceEdits'
import { RunningConfigGenerator } from '../RunningConfigGenerator'

/** What the config file commands need from the shell. */
export interface ConfigFileDeps {
  /** running-config body ('!' … 'end'). */
  body(device: Device): string[]
  /** `show running-config` output. */
  show(device: Device): string[]
  /** Runs IOS config text in global config mode on the device. */
  replay(device: Device, text: string): Device
  /** The device as it boots: factory configuration plus its startup-config. */
  reload(device: Device): Device
}

const BUILDING = ['Building configuration...', '[OK]']
const NO_STARTUP = '%Error opening nvram:startup-config (No such file or directory)'

function isYes(answer: string): boolean {
  const value = answer.trim().toLowerCase()
  return value === '' || 'yes'.startsWith(value)
}

export class ConfigFileCommands {
  private readonly deps: ConfigFileDeps

  constructor(deps: ConfigFileDeps) {
    this.deps = deps
  }

  registrations(): CliCommandRegistration[] {
    return [
      {
        modes: ['privilegedExec'],
        node: keyword('show', 'Show running system information', {
          children: [
            keyword('running-config', 'Current operating configuration', { run: (ctx) => ({ lines: cliText(...this.deps.show(ctx.device)) }) }),
            keyword('startup-config', 'Contents of startup configuration', { run: (ctx) => this.showStartup(ctx) }),
          ],
        }),
      },
      {
        modes: ['privilegedExec'],
        node: keyword('copy', 'Copy from one file to another', {
          children: [
            keyword('running-config', 'Copy from current system configuration', {
              children: [keyword('startup-config', 'Copy to startup configuration', { run: () => ({ ask: this.saveQuestion() }) })],
            }),
            keyword('startup-config', 'Copy from startup configuration', {
              children: [keyword('running-config', 'Update (merge with) current system configuration', { run: (ctx) => this.copyStartup(ctx) })],
            }),
          ],
        }),
      },
      {
        modes: ['privilegedExec'],
        node: keyword('write', 'Write running configuration to memory, network, or terminal', {
          run: (ctx) => this.save(ctx.device),
          children: [
            keyword('memory', 'Write to NV memory', { run: (ctx) => this.save(ctx.device) }),
            keyword('erase', 'Erase NV memory', { run: () => ({ ask: this.eraseQuestion() }) }),
          ],
        }),
      },
      {
        modes: ['privilegedExec'],
        node: keyword('erase', 'Erase a filesystem', {
          children: [keyword('startup-config', 'Erase contents of configuration memory', { run: () => ({ ask: this.eraseQuestion() }) })],
        }),
      },
      {
        modes: ['privilegedExec'],
        node: keyword('reload', 'Halt and perform a cold restart', { run: (ctx) => this.reload(ctx) }),
      },
    ]
  }

  /** Saves running-config to startup-config. */
  private save(device: Device): CliCommandResult {
    const text = this.deps.body(device).join('\n')
    return { lines: cliText(...BUILDING), device: DeviceEdits.updateManagement(device, (management) => ({ ...management, startupConfig: text })) }
  }

  private saveQuestion(): CliQuestion {
    return {
      prompt: 'Destination filename [startup-config]? ',
      secret: false,
      onAnswer: (answer, ctx) => {
        const name = answer.trim()
        if (name === '' || name === 'startup-config') return this.save(ctx.device)
        return { lines: [cliMessage(localizedMessage('cli:onlyStartupConfig'))] }
      },
    }
  }

  private showStartup(ctx: CliContext): CliCommandResult {
    const text = managementOf(ctx.device).startupConfig
    if (text === undefined) return { lines: cliError('startup-config is not present') }
    const lines = text.split('\n')
    return { lines: cliText(`Using ${RunningConfigGenerator.bytes(lines)} bytes`, ...lines) }
  }

  private copyStartup(ctx: CliContext): CliCommandResult {
    const text = managementOf(ctx.device).startupConfig
    if (text === undefined) return { lines: cliError(NO_STARTUP) }
    return {
      ask: {
        prompt: 'Destination filename [running-config]? ',
        secret: false,
        onAnswer: (_answer, answered) => {
          const bytes = RunningConfigGenerator.bytes(text.split('\n'))
          return {
            device: this.deps.replay(answered.device, text),
            lines: [...cliText(`${bytes} bytes copied in 0.416 secs (${Math.round(bytes / 0.416)} bytes/sec)`), ...cliLog('%SYS-5-CONFIG_I: Configured from memory by console')],
          }
        },
      },
    }
  }

  private eraseQuestion(): CliQuestion {
    return {
      prompt: 'Erasing the nvram filesystem will remove all configuration files! Continue? [confirm]',
      secret: false,
      onAnswer: (answer, ctx) => {
        if (!isYes(answer)) return {}
        const device = DeviceEdits.updateManagement(ctx.device, (management) => {
          const copy = { ...management }
          delete copy.startupConfig
          return copy
        })
        return { device, lines: [...cliText('[OK]', 'Erase of nvram: complete'), ...cliLog('%SYS-7-NV_BLOCK_INIT: Initialized the geometry of nvram')] }
      },
    }
  }

  /** "Save?" when running-config differs from startup-config, then "[confirm]". */
  private reload(ctx: CliContext): CliCommandResult {
    const saved = managementOf(ctx.device).startupConfig
    const modified = saved !== this.deps.body(ctx.device).join('\n')
    return { ask: modified ? this.saveBeforeReload() : this.confirmReload() }
  }

  private saveBeforeReload(): CliQuestion {
    return {
      prompt: 'System configuration has been modified. Save? [yes/no]: ',
      secret: false,
      onAnswer: (answer, ctx) => {
        const value = answer.trim().toLowerCase()
        if (value !== '' && 'yes'.startsWith(value)) return { ...this.save(ctx.device), ask: this.confirmReload() }
        if (value !== '' && 'no'.startsWith(value)) return { ask: this.confirmReload() }
        return { lines: cliError("% Please answer 'yes' or 'no'."), ask: this.saveBeforeReload() }
      },
    }
  }

  private confirmReload(): CliQuestion {
    return {
      prompt: 'Proceed with reload? [confirm]',
      secret: false,
      onAnswer: (answer, ctx) => {
        if (!isYes(answer)) return {}
        const platform = ctx.device.kind === 'router' || ctx.device.kind === 'wirelessRouter' ? '15.1(4)M4' : '12.2(25r)SEE4'
        return {
          device: this.deps.reload(ctx.device),
          lines: [
            ...cliLog('%SYS-5-RELOAD: Reload requested by console. Reload Reason: Reload Command.'),
            ...cliText('', `System Bootstrap, Version ${platform}, RELEASE SOFTWARE (fc1)`, 'Copyright (c) 1986-2012 by cisco Systems, Inc.', '', '', 'Press RETURN to get started!'),
          ],
          session: { kind: 'reloaded' },
        }
      },
    }
  }
}
