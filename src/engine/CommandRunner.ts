import type { CommandResult, FailureReason, ResolveResult, TerminalLine } from '../domain/EngineContract'
import type { Device, HostNetworkConfig, NetworkState } from '../domain/NetworkTypes'
import type { AdapterView, CommandFormatter } from './CommandFormatter'
import { DeviceLookup } from './DeviceLookup'
import type { DhcpService } from './DhcpService'
import type { DnsResolver } from './DnsResolver'
import { internetHosts } from './internetHosts'
import { PingCommand } from './PingCommand'
import type { ReachabilityChecker } from './ReachabilityChecker'
import type { SegmentFinder } from './SegmentFinder'
import { TerminalAvailability } from './TerminalAvailability'
import { TracertCommand } from './TracertCommand'

export interface CommandRunnerDependencies {
  segments: SegmentFinder
  reachability: ReachabilityChecker
  dns: DnsResolver
  dhcp: DhcpService
  formatter: CommandFormatter
}

const KNOWN_COMMANDS: ReadonlySet<string> = new Set(['ipconfig', 'ping', 'tracert', 'nslookup'])

/**
 * Parses a terminal line and runs it against the engine (PLAN §4.6).
 * The returned lines never include an echo of the typed command; the UI shows the input itself.
 */
export class CommandRunner {
  private readonly deps: CommandRunnerDependencies
  private readonly pingCommand: PingCommand
  private readonly tracertCommand: TracertCommand

  constructor(deps: CommandRunnerDependencies) {
    this.deps = deps
    this.pingCommand = new PingCommand(deps.reachability, deps.dns, deps.formatter)
    this.tracertCommand = new TracertCommand(deps.reachability, deps.dns, deps.formatter)
  }

  run(state: NetworkState, deviceId: string, commandLine: string): CommandResult {
    const device = DeviceLookup.require(state, deviceId)
    const [rawCommand, ...args] = commandLine.trim().split(/\s+/).filter((token) => token !== '')
    if (rawCommand === undefined) return { lines: [] }
    const command = rawCommand.toLowerCase()
    const { formatter } = this.deps

    if (command === 'help') return { lines: formatter.help() }
    if (!device.host || !TerminalAvailability.isAvailable(device)) return { lines: formatter.noTerminal() }
    if (!device.powered) return { lines: formatter.devicePoweredOff() }
    if (!KNOWN_COMMANDS.has(command)) return { lines: formatter.unknownCommand(rawCommand) }

    switch (command) {
      case 'ipconfig':
        return this.ipconfig(state, device, device.host, args)
      case 'ping':
        return this.pingCommand.run(state, device, args)
      case 'tracert':
        return this.tracertCommand.run(state, device, args)
      default:
        return { lines: this.nslookup(state, device, args) }
    }
  }

  private ipconfig(state: NetworkState, device: Device, host: HostNetworkConfig, args: string[]): CommandResult {
    const option = args[0]?.toLowerCase()
    const { formatter } = this.deps
    if (args.length > 1) return { lines: formatter.ipconfigBadOption() }
    if (option === undefined) return { lines: formatter.ipconfig(this.adapterView(state, device, host), false) }
    if (option === '/all') return { lines: formatter.ipconfig(this.adapterView(state, device, host), true) }
    if (option === '/renew') return this.renew(state, device)
    if (option === '/release') return this.release(state, device)
    return { lines: formatter.ipconfigBadOption() }
  }

  private renew(state: NetworkState, device: Device): CommandResult {
    const { formatter } = this.deps
    const result = this.deps.dhcp.renew(state, device.id)
    if (result.ok) {
      const renewed = DeviceLookup.require(result.nextState, device.id)
      const view = renewed.host ? this.adapterView(result.nextState, renewed, renewed.host) : null
      return { lines: view ? formatter.ipconfig(view, false) : [], nextState: result.nextState }
    }
    if (result.reason === 'dhcpNoServer' || result.reason === 'dhcpPoolExhausted') {
      return { lines: formatter.renewTimedOut(this.isWireless(state, device.id)) }
    }
    return { lines: this.dhcpRefusal(state, device, result.reason) }
  }

  private release(state: NetworkState, device: Device): CommandResult {
    const result = this.deps.dhcp.release(state, device.id)
    if (!result.ok) return { lines: this.dhcpRefusal(state, device, result.reason) }
    const released = DeviceLookup.require(result.nextState, device.id)
    const view = released.host ? this.adapterView(result.nextState, released, released.host) : null
    return { lines: view ? this.deps.formatter.released(view) : [], nextState: result.nextState }
  }

  /** Windows refuses /renew and /release without a link, and on a static adapter. */
  private dhcpRefusal(state: NetworkState, device: Device, reason: FailureReason): TerminalLine[] {
    const { formatter } = this.deps
    if (reason === 'cableDisconnected' || reason === 'portDisabled') {
      return formatter.mediaDisconnected(this.isWireless(state, device.id))
    }
    return formatter.dhcpNotPermitted()
  }

  private nslookup(state: NetworkState, device: Device, args: string[]): TerminalLine[] {
    const name = args[0]
    if (name === undefined) return this.deps.formatter.usage('nslookup')
    return this.formatResolve(this.deps.dns.resolve(state, device.id, name), name)
  }

  private formatResolve(result: ResolveResult, name: string): TerminalLine[] {
    const { formatter } = this.deps
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

  private adapterView(state: NetworkState, device: Device, host: HostNetworkConfig): AdapterView {
    const { segments } = this.deps
    const attachment = segments.attachment(state, device)
    return {
      hostName: device.id.toUpperCase(),
      wireless: attachment.ok ? attachment.portId === 'wlan0' : this.isWireless(state, device.id),
      connected: attachment.ok,
      mac: device.mac,
      host,
      duplicateAddress: segments.hasAddressConflict(state, device),
    }
  }

  /** True when the device only has a Wi-Fi link (no Ethernet cable at all). */
  private isWireless(state: NetworkState, deviceId: string): boolean {
    const ports = state.links.flatMap((link) => [link.a, link.b]).filter((end) => end.deviceId === deviceId)
    return !ports.some((end) => end.portId === 'eth0') && ports.some((end) => end.portId === 'wlan0')
  }
}
