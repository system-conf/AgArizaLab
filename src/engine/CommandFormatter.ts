import type { TerminalLine } from '../domain/EngineContract'
import type { HostNetworkConfig } from '../domain/NetworkTypes'

/** What ipconfig needs to know about the host's single adapter. */
export interface AdapterView {
  hostName: string
  /** 'eth0' → Ethernet, 'wlan0' → Wi-Fi. */
  wireless: boolean
  connected: boolean
  mac: string
  host: HostNetworkConfig
}

/** How every echo request of a ping ended (all four behave the same: deterministic engine). */
export type PingOutcome =
  | { kind: 'reply'; fromIp: string; ttl: number; baseTimeMs: number }
  /** "Reply from X: Destination host unreachable." (X = own IP for ARP failures, gateway for routing). */
  | { kind: 'unreachable'; fromIp: string }
  | { kind: 'timeout' }
  /** No usable adapter/route at all: "PING: transmit failed. General failure." */
  | { kind: 'generalFailure' }

const ECHO_COUNT = 4
/** Fixed per-reply jitter so times look natural yet tests stay stable. */
const TIME_JITTER_MS: readonly number[] = [0, 1, 0, 2]
/** Width of "IPv4 Address. . . . . . . . . . . " before the colon, as printed by Windows. */
const LABEL_WIDTH = 34
const FIELD_INDENT = '   '

const HELP_LINES: readonly string[] = [
  'Kullanılabilir komutlar:',
  '  ipconfig            IP adresini, alt ağ maskesini ve varsayılan ağ geçidini gösterir',
  '  ipconfig /all       MAC adresi, DHCP durumu ve DNS sunucuları dahil tüm ayrıntılar',
  '  ipconfig /renew     DHCP sunucusundan yeniden IP adresi ister',
  '  ping <ip veya ad>   Bir adrese ulaşılıp ulaşılamadığını dener',
  '  nslookup <ad>       Bir adın hangi IP adresine karşılık geldiğini DNS sunucusuna sorar',
  '  help                Bu listeyi gösterir',
]

/** Windows-style (English) command output. Pure string building, no network logic. */
export class CommandFormatter {
  ipconfig(view: AdapterView, all: boolean): TerminalLine[] {
    const lines: string[] = ['', 'Windows IP Configuration', '']
    if (all) {
      lines.push(this.field('Host Name', view.hostName), '')
    }
    lines.push(`${view.wireless ? 'Wireless LAN adapter Wi-Fi' : 'Ethernet adapter Ethernet'}:`, '')

    if (!view.connected) {
      lines.push(this.field('Media State', 'Media disconnected'), this.field('Connection-specific DNS Suffix', ''))
      if (all) lines.push(...this.hardwareFields(view))
      return this.output(lines)
    }

    lines.push(this.field('Connection-specific DNS Suffix', ''))
    if (all) lines.push(...this.hardwareFields(view))
    lines.push(...this.addressFields(view, all))
    return this.output(lines)
  }

  renewNotPermitted(): TerminalLine[] {
    return this.output(['', 'Windows IP Configuration', '', 'The operation failed as no adapter is in the state permissible for this operation.'])
  }

  renewTimedOut(wireless: boolean): TerminalLine[] {
    const adapter = wireless ? 'Wi-Fi' : 'Ethernet'
    return this.output([
      '',
      'Windows IP Configuration',
      '',
      `An error occurred while renewing interface ${adapter} : unable to contact your DHCP server. Request has timed out.`,
    ])
  }

  ping(targetIp: string, resolvedName: string | null, outcome: PingOutcome): TerminalLine[] {
    const header = resolvedName === null ? targetIp : `${resolvedName} [${targetIp}]`
    const lines: string[] = ['', `Pinging ${header} with 32 bytes of data:`]
    for (let index = 0; index < ECHO_COUNT; index += 1) lines.push(this.echoLine(outcome, index))

    const received = outcome.kind === 'reply' || outcome.kind === 'unreachable' ? ECHO_COUNT : 0
    const lost = ECHO_COUNT - received
    lines.push(
      '',
      `Ping statistics for ${targetIp}:`,
      `    Packets: Sent = ${ECHO_COUNT}, Received = ${received}, Lost = ${lost} (${(lost / ECHO_COUNT) * 100}% loss),`,
    )
    if (outcome.kind === 'reply') {
      const times = this.times(outcome.baseTimeMs)
      const average = Math.round(times.reduce((sum, time) => sum + time, 0) / times.length)
      lines.push(
        'Approximate round trip times in milli-seconds:',
        `    Minimum = ${Math.min(...times)}ms, Maximum = ${Math.max(...times)}ms, Average = ${average}ms`,
      )
    }
    return this.output(lines)
  }

  pingHostNotFound(name: string): TerminalLine[] {
    return this.output([`Ping request could not find host ${name}. Please check the name and try again.`])
  }

  nslookupAnswer(serverName: string, serverIp: string, name: string, ip: string): TerminalLine[] {
    return this.output([
      ...this.serverLines(serverName, serverIp),
      '',
      'Non-authoritative answer:',
      `Name:    ${name}`,
      `Address:  ${ip}`,
    ])
  }

  nslookupNotFound(serverName: string, serverIp: string, name: string): TerminalLine[] {
    return this.output([...this.serverLines(serverName, serverIp), '', `*** ${serverName} can't find ${name}: Non-existent domain`])
  }

  nslookupNoAnswer(serverIp: string, name: string): TerminalLine[] {
    return this.output([...this.serverLines('UnKnown', serverIp), '', `*** UnKnown can't find ${name}: No response from server`])
  }

  nslookupTimedOut(serverIp: string): TerminalLine[] {
    return this.output([
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
    return this.output(['*** Default servers are not available', ...this.serverLines('UnKnown', '127.0.0.1')])
  }

  help(): TerminalLine[] {
    return HELP_LINES.map((text) => ({ kind: 'info', text }))
  }

  unknownCommand(command: string): TerminalLine[] {
    return this.error(`'${command}' komutu tanınmadı. Kullanılabilir komutları görmek için 'help' yazın.`)
  }

  usage(text: string): TerminalLine[] {
    return this.error(`Kullanım: ${text}`)
  }

  unknownOption(option: string): TerminalLine[] {
    return this.error(`'${option}' seçeneği tanınmadı. 'help' yazarak desteklenen komutları görebilirsiniz.`)
  }

  devicePoweredOff(): TerminalLine[] {
    return this.error('Cihaz kapalı. Komut çalıştırmak için önce cihazı açın.')
  }

  noTerminal(): TerminalLine[] {
    return this.error('Bu cihazda komut satırı yok. Terminal yalnızca bilgisayar, kasa ve kayıt cihazında kullanılabilir.')
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
    if (host.ip !== '') {
      lines.push(this.field('IPv4 Address', `${host.ip}${suffix}`), this.field('Subnet Mask', host.mask))
    } else if (host.mode === 'dhcp') {
      // Windows falls back to APIPA when no DHCP answer arrived.
      lines.push(this.field('Autoconfiguration IPv4 Address', `${this.apipa(view.mac)}${suffix}`), this.field('Subnet Mask', '255.255.0.0'))
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

  private echoLine(outcome: PingOutcome, index: number): string {
    switch (outcome.kind) {
      case 'reply': {
        const time = this.times(outcome.baseTimeMs)[index] ?? outcome.baseTimeMs
        return `Reply from ${outcome.fromIp}: bytes=32 time=${time}ms TTL=${outcome.ttl}`
      }
      case 'unreachable':
        return `Reply from ${outcome.fromIp}: Destination host unreachable.`
      case 'timeout':
        return 'Request timed out.'
      case 'generalFailure':
        return 'PING: transmit failed. General failure.'
    }
  }

  private times(baseTimeMs: number): number[] {
    return TIME_JITTER_MS.map((jitter) => baseTimeMs + jitter)
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

  private output(lines: string[]): TerminalLine[] {
    return lines.map((text) => ({ kind: 'output', text }))
  }

  private error(text: string): TerminalLine[] {
    return [{ kind: 'error', text }]
  }
}
