// Windows commands the simulator terminal (src/sim/terminal SimTerminal) does not answer (docs/CLI.md §7, C4):
// `hostname`, `netstat`, `ipconfig /displaydns`, `ipconfig /flushdns`, and `help` listing them as well.
// The UI asks this layer first and falls back to SimTerminal when `run` returns null. Pure: it reads the
// device and its runtime and never touches the engine; a table change is handed back as `request`.
//
// Not here yet: `arp -d <ip>` (one entry). SimClearTableRequest clears the whole table, so deleting one
// entry needs an `ip` filter on that request in src/sim/contract; SimTerminal keeps printing the usage.
import type { Device, TerminalLine } from '../../domain'
import { CommandFormatter } from '../../engine/CommandFormatter'
import { messageLine, textLines } from '../../engine/terminalLines'
import { type AppMessageKey, localizedMessage } from '../../i18n/messageKeys'
import { TerminalAvailability } from '../../net/TerminalAvailability'
import type { SimClearTableRequest } from '../../sim/contract'
import type { CliEnvironment } from '../contract'
import { DnsCacheView } from './DnsCacheView'
import { NetstatView } from './NetstatView'

export interface HostCommandResult {
  readonly lines: TerminalLine[]
  /** `ipconfig /flushdns`: inject it into the running engine (no packets, done at once); none without one. */
  readonly request?: SimClearTableRequest
}

/** Help lines this layer adds, each inserted after the engine's help line named first. */
const HELP_ADDITIONS: readonly (readonly [AppMessageKey, readonly AppMessageKey[]])[] = [
  ['engine:help.ipconfigRelease', ['hostCli:help.ipconfigDisplayDns', 'hostCli:help.ipconfigFlushDns']],
  ['engine:help.arpDelete', ['hostCli:help.netstat', 'hostCli:help.hostname']],
]

/** `hostname` with an argument: Windows refuses to rename from the prompt. */
const SET_HOSTNAME_REFUSED = 'sethostname: Use the Network Control Panel Applet to set hostname.'

export class HostCommandLayer {
  private static readonly formatter = new CommandFormatter()

  /** Whether `run` answers this line (else SimTerminal does). */
  static handles(commandLine: string): boolean {
    const [command, ...args] = HostCommandLayer.tokens(commandLine)
    switch (command) {
      case 'help':
      case 'hostname':
      case 'netstat':
        return true
      case 'ipconfig': {
        const option = args[0]?.toLowerCase()
        return args.length === 1 && (option === '/displaydns' || option === '/flushdns')
      }
      default:
        return false
    }
  }

  /** The command's output, or null when SimTerminal should answer the line. */
  static run(device: Device, env: CliEnvironment, commandLine: string): HostCommandResult | null {
    if (!HostCommandLayer.handles(commandLine)) return null
    const [command, ...args] = HostCommandLayer.tokens(commandLine)
    const { formatter } = HostCommandLayer
    if (command === 'help') return { lines: HostCommandLayer.help() }
    if (!TerminalAvailability.isAvailable(device)) return { lines: formatter.noTerminal() }
    if (!device.powered) return { lines: formatter.devicePoweredOff() }
    const runtime = env.runtime?.deviceId === device.id ? env.runtime : undefined
    switch (command) {
      case 'hostname':
        return { lines: args.length === 0 ? textLines([HostCommandLayer.hostName(device)]) : textLines([SET_HOSTNAME_REFUSED], 'error') }
      case 'netstat': {
        const options = NetstatView.parse(args)
        if (options === null) return { lines: textLines(NetstatView.usage()) }
        return { lines: textLines(NetstatView.lines(NetstatView.sockets(device, runtime), options)) }
      }
      default:
        if (args[0]?.toLowerCase() === '/displaydns') {
          return { lines: textLines(DnsCacheView.displayLines(runtime?.services.dnsCache ?? [], env.now)) }
        }
        return {
          lines: textLines(DnsCacheView.flushedLines()),
          request: { kind: 'clearTable', deviceId: device.id, table: 'dnsCache' },
        }
    }
  }

  /** The computer name, as `ipconfig /all` prints it (HostAdapters: the device id in capitals). */
  static hostName(device: Device): string {
    return device.id.toUpperCase()
  }

  /** The engine's command list with this layer's commands added. */
  static help(): TerminalLine[] {
    return HostCommandLayer.formatter.help().flatMap((line) => {
      const added = HELP_ADDITIONS.find(([after]) => line.message?.key === after)?.[1] ?? []
      return [line, ...added.map((key) => messageLine(localizedMessage(key), 'info'))]
    })
  }

  private static tokens(commandLine: string): string[] {
    const tokens = commandLine.trim().split(/\s+/).filter((token) => token !== '')
    const [command, ...args] = tokens
    return command === undefined ? [] : [command.toLowerCase(), ...args]
  }
}
