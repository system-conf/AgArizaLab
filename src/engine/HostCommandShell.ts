import type { PacketTrace, ResolveResult, TerminalLine } from '../domain/EngineContract'
import type { FailureReasonV2, ResolveResultV2 } from '../domain/v2'
import type { AdapterView, CommandFormatter } from './CommandFormatter'
import { internetHosts } from './internetHosts'
import { PingCommand } from './PingCommand'
import type { Prober } from './ProbeReports'
import { TracertCommand } from './TracertCommand'

/** Whether a device offers its command prompt right now. */
export type TerminalAccess = 'ready' | 'noTerminal' | 'poweredOff'

/** `ipconfig /renew` or `/release`; `wireless` names the adapter in Windows' error text. */
export type ShellDhcpResult<State> = { ok: true; nextState: State } | { ok: false; reason: FailureReasonV2; wireless: boolean }

export interface ShellResult<State> {
  lines: TerminalLine[]
  nextState?: State
  trace?: PacketTrace
}

/** What the host command prompt needs from one state model (v1 or v2). */
export interface HostShellBackend<State> extends Prober<State> {
  /** Throws for an unknown device id (programmer error). */
  access(state: State, deviceId: string): TerminalAccess
  /** The adapters ipconfig lists, in order. */
  adapters(state: State, deviceId: string): AdapterView[]
  renew(state: State, deviceId: string): ShellDhcpResult<State>
  release(state: State, deviceId: string): ShellDhcpResult<State>
  resolve(state: State, deviceId: string, name: string): ResolveResult | ResolveResultV2
}

const KNOWN_COMMANDS: ReadonlySet<string> = new Set(['ipconfig', 'ping', 'tracert', 'nslookup'])

/**
 * Parses a terminal line and runs it on a host (PLAN §4.6), independent of the state model.
 * The returned lines never include an echo of the typed command; the UI shows the input itself.
 */
export class HostCommandShell<State> {
  private readonly backend: HostShellBackend<State>
  private readonly formatter: CommandFormatter
  private readonly pingCommand: PingCommand<State>
  private readonly tracertCommand: TracertCommand<State>

  constructor(backend: HostShellBackend<State>, formatter: CommandFormatter) {
    this.backend = backend
    this.formatter = formatter
    this.pingCommand = new PingCommand(backend, formatter)
    this.tracertCommand = new TracertCommand(backend, formatter)
  }

  run(state: State, deviceId: string, commandLine: string): ShellResult<State> {
    const access = this.backend.access(state, deviceId)
    const [rawCommand, ...args] = commandLine.trim().split(/\s+/).filter((token) => token !== '')
    if (rawCommand === undefined) return { lines: [] }
    const command = rawCommand.toLowerCase()
    const { formatter } = this

    if (command === 'help') return { lines: formatter.help() }
    if (access === 'noTerminal') return { lines: formatter.noTerminal() }
    if (access === 'poweredOff') return { lines: formatter.devicePoweredOff() }
    if (!KNOWN_COMMANDS.has(command)) return { lines: formatter.unknownCommand(rawCommand) }

    switch (command) {
      case 'ipconfig':
        return this.ipconfig(state, deviceId, args)
      case 'ping':
        return this.pingCommand.run(state, deviceId, args)
      case 'tracert':
        return this.tracertCommand.run(state, deviceId, args)
      default:
        return { lines: this.nslookup(state, deviceId, args) }
    }
  }

  private ipconfig(state: State, deviceId: string, args: string[]): ShellResult<State> {
    const option = args[0]?.toLowerCase()
    const { formatter } = this
    if (args.length > 1) return { lines: formatter.ipconfigBadOption() }
    if (option === undefined) return { lines: formatter.adapters(this.backend.adapters(state, deviceId), false) }
    if (option === '/all') return { lines: formatter.adapters(this.backend.adapters(state, deviceId), true) }
    if (option === '/renew') return this.renew(state, deviceId)
    if (option === '/release') return this.release(state, deviceId)
    return { lines: formatter.ipconfigBadOption() }
  }

  private renew(state: State, deviceId: string): ShellResult<State> {
    const result = this.backend.renew(state, deviceId)
    if (result.ok) {
      return { lines: this.formatter.adapters(this.backend.adapters(result.nextState, deviceId), false), nextState: result.nextState }
    }
    if (result.reason === 'dhcpNoServer' || result.reason === 'dhcpPoolExhausted') {
      return { lines: this.formatter.renewTimedOut(result.wireless) }
    }
    return { lines: this.dhcpRefusal(result.reason, result.wireless) }
  }

  private release(state: State, deviceId: string): ShellResult<State> {
    const result = this.backend.release(state, deviceId)
    if (!result.ok) return { lines: this.dhcpRefusal(result.reason, result.wireless) }
    return { lines: this.formatter.releasedAdapters(this.backend.adapters(result.nextState, deviceId)), nextState: result.nextState }
  }

  /** Windows refuses /renew and /release without a link, and on a static adapter. */
  private dhcpRefusal(reason: FailureReasonV2, wireless: boolean): TerminalLine[] {
    if (reason === 'cableDisconnected' || reason === 'portDisabled') return this.formatter.mediaDisconnected(wireless)
    return this.formatter.dhcpNotPermitted()
  }

  private nslookup(state: State, deviceId: string, args: string[]): TerminalLine[] {
    const name = args[0]
    if (name === undefined) return this.formatter.usage('nslookup')
    return this.formatResolve(this.backend.resolve(state, deviceId, name), name)
  }

  private formatResolve(result: ResolveResult | ResolveResultV2, name: string): TerminalLine[] {
    const { formatter } = this
    if (result.ok) return formatter.nslookupAnswer(this.serverName(result.dnsServer), result.dnsServer, name, result.ip)
    const server = result.dnsServer ?? ''
    switch (result.reason) {
      case 'dnsNotSet':
        return formatter.nslookupNoServers()
      case 'nameNotFound':
        return formatter.nslookupNotFound(this.serverName(server), server, name)
      case 'dnsNoAnswer':
        return formatter.nslookupNoAnswer(server, name)
      default:
        return formatter.nslookupTimedOut(server)
    }
  }

  private serverName(serverIp: string): string {
    return internetHosts.dnsServerNames[serverIp] ?? 'UnKnown'
  }
}
