import type { TerminalLine } from '../domain/EngineContract'
import type { HostNetworkConfig } from '../domain/NetworkTypes'
import { type AppMessageKey, localizedMessage } from '../i18n/messageKeys'
import type { OptionError } from './CommandOptions'
import { messageLine, textLines } from './terminalLines'

/** What ipconfig needs to know about the host's single adapter. */
export interface AdapterView {
  hostName: string
  /** 'eth0' → Ethernet, 'wlan0' → Wi-Fi. */
  wireless: boolean
  connected: boolean
  mac: string
  host: HostNetworkConfig
  /** Another device in the segment uses the same address (Windows duplicate address detection). */
  duplicateAddress: boolean
}

/** Commands with an app usage hint. */
export type UsageCommand = 'ipconfig' | 'ping' | 'tracert' | 'nslookup'

/** Width of "IPv4 Address. . . . . . . . . . . " before the colon, as printed by Windows. */
const LABEL_WIDTH = 34
const FIELD_INDENT = '   '
const APIPA_MASK = '255.255.0.0'

const USAGE_KEYS: Readonly<Record<UsageCommand, AppMessageKey>> = {
  ipconfig: 'engine:usage.ipconfig',
  ping: 'engine:usage.ping',
  tracert: 'engine:usage.tracert',
  nslookup: 'engine:usage.nslookup',
}

const HELP_KEYS: readonly AppMessageKey[] = [
  'engine:help.title',
  'engine:help.ipconfig',
  'engine:help.ipconfigAll',
  'engine:help.ipconfigRenew',
  'engine:help.ipconfigRelease',
  'engine:help.ping',
  'engine:help.pingCount',
  'engine:help.pingSize',
  'engine:help.pingContinuous',
  'engine:help.tracert',
  'engine:help.nslookup',
  'engine:help.help',
]

/**
 * Windows-style (English) ipconfig / nslookup output as text lines, plus the app messages around
 * commands (help, usage, unknown command, device off) as translated message lines.
 * Pure line building, no network logic. Ping and tracert have their own formatters.
 */
export class CommandFormatter {
  ipconfig(view: AdapterView, all: boolean): TerminalLine[] {
    const lines: string[] = ['', 'Windows IP Configuration', '']
    if (all) {
      lines.push(this.field('Host Name', view.hostName), '')
    }
    lines.push(`${this.adapterTitle(view.wireless)}:`, '')

    if (!view.connected) {
      lines.push(this.field('Media State', 'Media disconnected'), this.field('Connection-specific DNS Suffix', ''))
      if (all) lines.push(...this.hardwareFields(view))
      return textLines(lines)
    }

    lines.push(this.field('Connection-specific DNS Suffix', ''))
    if (all) lines.push(...this.hardwareFields(view))
    lines.push(...this.addressFields(view, all))
    return textLines(lines)
  }

  /** `ipconfig /release`: the adapter is left without an IPv4 address. */
  released(view: AdapterView): TerminalLine[] {
    return textLines([
      '',
      'Windows IP Configuration',
      '',
      `${this.adapterTitle(view.wireless)}:`,
      '',
      this.field('Connection-specific DNS Suffix', ''),
      this.field('Default Gateway', ''),
    ])
  }

  /** /renew or /release on a static adapter. */
  dhcpNotPermitted(): TerminalLine[] {
    return this.windowsIpError('The operation failed as no adapter is in the state permissible for this operation.')
  }

  /** /renew or /release without a link (unplugged cable, disabled switch port). */
  mediaDisconnected(wireless: boolean): TerminalLine[] {
    return this.windowsIpError(`No operation can be performed on ${this.adapterName(wireless)} while it has its media disconnected.`)
  }

  renewTimedOut(wireless: boolean): TerminalLine[] {
    return this.windowsIpError(
      `An error occurred while renewing interface ${this.adapterName(wireless)} : unable to contact your DHCP server. Request has timed out.`,
    )
  }

  /** ipconfig with an option it does not know. */
  ipconfigBadOption(): TerminalLine[] {
    return [...textLines(['Error: unrecognized or incomplete command line.'], 'error'), this.usageLine('ipconfig')]
  }

  nslookupAnswer(serverName: string, serverIp: string, name: string, ip: string): TerminalLine[] {
    return textLines([
      ...this.serverLines(serverName, serverIp),
      '',
      'Non-authoritative answer:',
      `Name:    ${name}`,
      `Address:  ${ip}`,
    ])
  }

  nslookupNotFound(serverName: string, serverIp: string, name: string): TerminalLine[] {
    return textLines([...this.serverLines(serverName, serverIp), '', `*** ${serverName} can't find ${name}: Non-existent domain`])
  }

  nslookupNoAnswer(serverIp: string, name: string): TerminalLine[] {
    return textLines([...this.serverLines('UnKnown', serverIp), '', `*** UnKnown can't find ${name}: No response from server`])
  }

  nslookupTimedOut(serverIp: string): TerminalLine[] {
    return textLines([
      'DNS request timed out.',
      '    timeout was 2 seconds.',
      ...this.serverLines('UnKnown', serverIp),
      '',
      'DNS request timed out.',
      '    timeout was 2 seconds.',
      '*** Request to UnKnown timed-out',
    ])
  }

  nslookupNoServers(): TerminalLine[] {
    return textLines(['*** Default servers are not available', ...this.serverLines('UnKnown', '127.0.0.1')])
  }

  help(): TerminalLine[] {
    return HELP_KEYS.map((key) => messageLine(localizedMessage(key), 'info'))
  }

  /** What cmd.exe prints, followed by a translated hint about the lab's commands. */
  unknownCommand(command: string): TerminalLine[] {
    return [
      ...textLines([`'${command}' is not recognized as an internal or external command,`, 'operable program or batch file.'], 'error'),
      messageLine(localizedMessage('engine:unknownCommand', { command }), 'info'),
    ]
  }

  usage(command: UsageCommand): TerminalLine[] {
    return [this.usageLine(command)]
  }

  /** Windows' own wording for ping / tracert argument errors, plus the usage hint where Windows prints its usage. */
  optionError(error: OptionError, command: UsageCommand): TerminalLine[] {
    switch (error.kind) {
      case 'badOption':
        return [...textLines([`Bad option ${error.option}.`], 'error'), this.usageLine(command)]
      case 'missingValue':
        return [...textLines([`Value must be supplied for option ${error.option}.`], 'error'), this.usageLine(command)]
      case 'badValue':
        return textLines([`Bad value for option ${error.option}, valid range is from ${error.min} to ${error.max}.`], 'error')
      case 'badParameter':
        return textLines([`Bad parameter ${error.value}.`], 'error')
      case 'missingTarget':
        return [this.usageLine(command)]
    }
  }

  devicePoweredOff(): TerminalLine[] {
    return [messageLine(localizedMessage('engine:devicePoweredOff'))]
  }

  noTerminal(): TerminalLine[] {
    return [messageLine(localizedMessage('engine:noTerminal'))]
  }

  private usageLine(command: UsageCommand): TerminalLine {
    return messageLine(localizedMessage(USAGE_KEYS[command]))
  }

  private windowsIpError(text: string): TerminalLine[] {
    return textLines(['', 'Windows IP Configuration', '', text])
  }

  private adapterName(wireless: boolean): string {
    return wireless ? 'Wi-Fi' : 'Ethernet'
  }

  private adapterTitle(wireless: boolean): string {
    return wireless ? 'Wireless LAN adapter Wi-Fi' : 'Ethernet adapter Ethernet'
  }

  private hardwareFields(view: AdapterView): string[] {
    return [
      this.field('Physical Address', view.mac.toUpperCase().replaceAll(':', '-')),
      this.field('DHCP Enabled', view.host.mode === 'dhcp' ? 'Yes' : 'No'),
      this.field('Autoconfiguration Enabled', 'Yes'),
    ]
  }

  private addressFields(view: AdapterView, all: boolean): string[] {
    const { host } = view
    const lines: string[] = []
    const suffix = all ? '(Preferred)' : ''
    if (host.ip !== '' && view.duplicateAddress) {
      // Windows marks a duplicate address unusable and falls back to APIPA. Real Windows shows the
      // "(Duplicate)" line only with /all; the lab shows it always so the cause stays visible.
      lines.push(
        this.field('IPv4 Address', `${host.ip}(Duplicate)`),
        this.field('Subnet Mask', host.mask),
        this.field('Autoconfiguration IPv4 Address', `${this.apipa(view.mac)}${suffix}`),
        this.field('Subnet Mask', APIPA_MASK),
      )
    } else if (host.ip !== '') {
      lines.push(this.field('IPv4 Address', `${host.ip}${suffix}`), this.field('Subnet Mask', host.mask))
    } else if (host.mode === 'dhcp') {
      // Windows falls back to APIPA when no DHCP answer arrived.
      lines.push(this.field('Autoconfiguration IPv4 Address', `${this.apipa(view.mac)}${suffix}`), this.field('Subnet Mask', APIPA_MASK))
    }
    lines.push(this.field('Default Gateway', host.ip === '' ? '' : host.gateway))
    if (all) lines.push(...this.multiField('DNS Servers', host.dns))
    return lines
  }

  /** Deterministic 169.254.x.y derived from the last two MAC bytes. */
  private apipa(mac: string): string {
    const bytes = mac.split(/[:-]/).map((part) => Number.parseInt(part, 16))
    const third = bytes[4]
    const fourth = bytes[5]
    if (third === undefined || fourth === undefined || Number.isNaN(third) || Number.isNaN(fourth)) return '169.254.1.1'
    return `169.254.${Math.max(1, Math.min(254, third))}.${Math.max(1, Math.min(254, fourth))}`
  }

  private serverLines(serverName: string, serverIp: string): string[] {
    return [`Server:  ${serverName}`, `Address:  ${serverIp}`]
  }

  /** "   IPv4 Address. . . . . . . . . . . : value" with Windows dot leaders. */
  private field(label: string, value: string): string {
    // Windows prints this one label with two spaces instead of the usual dot pattern.
    const leader = label === 'Connection-specific DNS Suffix' ? `${label}  . ` : this.dotLeader(label)
    return `${FIELD_INDENT}${leader}: ${value}`
  }

  /** Dots on even columns, spaces on odd ones, up to the fixed label width. */
  private dotLeader(label: string): string {
    let leader = label
    for (let column = label.length; column < LABEL_WIDTH; column += 1) {
      leader += column % 2 === 0 ? '.' : ' '
    }
    return leader
  }

  private multiField(label: string, values: string[]): string[] {
    if (values.length === 0) return [this.field(label, '')]
    const [first, ...rest] = values
    const indent = ' '.repeat(FIELD_INDENT.length + LABEL_WIDTH + 2)
    return [this.field(label, first ?? ''), ...rest.map((value) => `${indent}${value}`)]
  }
}
