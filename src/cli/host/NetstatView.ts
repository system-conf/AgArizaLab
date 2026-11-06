// `netstat [-a] [-n]` on a Windows host (docs/CLI.md §7, C4). Built from the lab and, when the simulation
// runs, the device's runtime:
// - listening sockets come from the configuration: DNS server (UDP 53), DHCP server (UDP 67), DHCP client
//   NICs (UDP 68). Windows' own system sockets (135, 445, 137/138 …) are deliberately left out: they would
//   only distract from the lab's traffic.
// - connections come from the runtime's service sessions: an HTTP client is a TCP connection to port 80,
//   a DNS query in flight is a UDP socket on its ephemeral port. Without a runtime there are none.
import type { Device } from '../../domain'
import { Ipv4 } from '../../net/Ipv4'
import { L3Interfaces } from '../../net/L3Interfaces'
import type { DeviceRuntime, HttpClientSession } from '../../sim/contract'
import { SIM_PORTS } from '../../sim/contract'

export interface NetstatOptions {
  /** `-a`: listening TCP ports and UDP sockets too. */
  readonly all: boolean
  /** `-n`: port numbers instead of service names. Addresses are always numeric in the lab. */
  readonly numeric: boolean
}

export type NetstatState = 'LISTENING' | 'SYN_SENT' | 'ESTABLISHED' | 'LAST_ACK'

/** One row of the table. UDP rows have no state; their foreign address is '*:*'. */
export interface NetstatSocket {
  readonly protocol: 'TCP' | 'UDP'
  readonly localIp: string
  readonly localPort: number
  /** null = '*:*' (UDP). */
  readonly foreign: { readonly ip: string; readonly port: number } | null
  readonly state: NetstatState | null
}

const ANY_ADDRESS = '0.0.0.0'
const COLUMN_WIDTH = 23
const PROTOCOL_WIDTH = 7
/** Service names Windows prints for well-known ports without -n (%SystemRoot%\system32\drivers\etc\services). */
const PORT_NAMES: ReadonlyMap<number, string> = new Map([
  [SIM_PORTS.dns, 'domain'],
  [SIM_PORTS.dhcpServer, 'bootps'],
  [SIM_PORTS.dhcpClient, 'bootpc'],
  [SIM_PORTS.http, 'http'],
])

const TCP_STATES: Readonly<Record<HttpClientSession['state'], NetstatState | null>> = {
  synSent: 'SYN_SENT',
  requestSent: 'ESTABLISHED',
  // The server closes after its response (HTTP/1.0); the client's FIN waits for the last ACK.
  closing: 'LAST_ACK',
  done: null,
}

export class NetstatView {
  /** Parses `-a`, `-n`, `-an`, `/a` …; null for anything else (the usage text is printed). */
  static parse(args: readonly string[]): NetstatOptions | null {
    let all = false
    let numeric = false
    for (const arg of args) {
      if (!/^[-/][a-z]+$/i.test(arg)) return null
      for (const letter of arg.slice(1).toLowerCase()) {
        if (letter === 'a') all = true
        else if (letter === 'n') numeric = true
        else return null
      }
    }
    return { all, numeric }
  }

  /** Every socket of the host, TCP first, each protocol sorted by local address and port. */
  static sockets(device: Device, runtime: DeviceRuntime | undefined): NetstatSocket[] {
    const sockets = [...NetstatView.listeners(device), ...NetstatView.sessions(device, runtime)]
    const order = (socket: NetstatSocket) => [socket.protocol === 'TCP' ? 0 : 1, Ipv4.parse(socket.localIp) ?? 0, socket.localPort]
    return sockets.sort((a, b) => {
      const [first, second] = [order(a), order(b)]
      for (let index = 0; index < first.length; index += 1) {
        const difference = (first[index] ?? 0) - (second[index] ?? 0)
        if (difference !== 0) return difference
      }
      return 0
    })
  }

  /** The command's output (device text). */
  static lines(sockets: readonly NetstatSocket[], options: NetstatOptions): string[] {
    const shown = options.all ? sockets : sockets.filter((socket) => socket.protocol === 'TCP' && socket.state !== 'LISTENING')
    const rows = shown.map((socket) => {
      const local = `${socket.localIp}:${NetstatView.port(socket.localPort, options.numeric)}`
      const foreign = socket.foreign === null ? '*:*' : `${socket.foreign.ip}:${NetstatView.port(socket.foreign.port, options.numeric)}`
      return `  ${socket.protocol.padEnd(PROTOCOL_WIDTH)}${NetstatView.column(local)}${NetstatView.column(foreign)}${socket.state ?? ''}`.trimEnd()
    })
    return ['', 'Active Connections', '', '  Proto  Local Address          Foreign Address        State', ...rows]
  }

  /** Windows' help text, limited to the options the lab supports. */
  static usage(): string[] {
    return [
      '',
      'Displays protocol statistics and current TCP/IP network connections.',
      '',
      'NETSTAT [-a] [-n]',
      '',
      '  -a            Displays all connections and listening ports.',
      '  -n            Displays addresses and port numbers in numerical form.',
      '',
    ]
  }

  private static listeners(device: Device): NetstatSocket[] {
    const udp = (port: number): NetstatSocket => ({ protocol: 'UDP', localIp: ANY_ADDRESS, localPort: port, foreign: null, state: null })
    const sockets: NetstatSocket[] = []
    if (device.services?.dns?.enabled === true) sockets.push(udp(SIM_PORTS.dns))
    if (device.services?.dhcp?.enabled === true) sockets.push(udp(SIM_PORTS.dhcpServer))
    if (L3Interfaces.nics(device).some((nic) => nic.addressing === 'dhcp')) sockets.push(udp(SIM_PORTS.dhcpClient))
    return sockets
  }

  private static sessions(device: Device, runtime: DeviceRuntime | undefined): NetstatSocket[] {
    const sockets: NetstatSocket[] = []
    for (const session of runtime?.services.sessions ?? []) {
      if (session.kind === 'httpClient') {
        const state = TCP_STATES[session.state]
        if (state === null) continue
        const localIp = NetstatView.sourceAddress(device, session.serverIp)
        sockets.push({ protocol: 'TCP', localIp, localPort: session.srcPort, foreign: { ip: session.serverIp, port: SIM_PORTS.http }, state })
      } else if (session.kind === 'dnsClient') {
        const localIp = NetstatView.sourceAddress(device, session.servers[session.serverIndex] ?? '')
        sockets.push({ protocol: 'UDP', localIp, localPort: session.srcPort, foreign: null, state: null })
      }
    }
    return sockets
  }

  /** The NIC address the host sends from: the NIC on the target's subnet, else the first addressed one. */
  private static sourceAddress(device: Device, target: string): string {
    const nics = L3Interfaces.nics(device).filter((nic) => nic.address !== '')
    const local = nics.find((nic) => Ipv4.isValid(target) && Ipv4.sameSubnet(nic.address, target, nic.mask))
    return (local ?? nics[0])?.address ?? ANY_ADDRESS
  }

  private static port(port: number, numeric: boolean): string {
    return numeric ? String(port) : (PORT_NAMES.get(port) ?? String(port))
  }

  private static column(text: string): string {
    return text.length < COLUMN_WIDTH ? text.padEnd(COLUMN_WIDTH) : `${text} `
  }
}
