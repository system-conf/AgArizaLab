import type { CommandResult, ReachResult, ResolveResult, TerminalLine } from '../domain/EngineContract'
import type { Device, HostNetworkConfig, NetworkState } from '../domain/NetworkTypes'
import type { AdapterView, CommandFormatter, PingOutcome } from './CommandFormatter'
import { DeviceLookup } from './DeviceLookup'
import type { DhcpService } from './DhcpService'
import type { DnsResolver } from './DnsResolver'
import { internetHosts } from './internetHosts'
import { Ipv4 } from './Ipv4'
import type { ReachabilityChecker } from './ReachabilityChecker'
import type { SegmentFinder } from './SegmentFinder'
import { TerminalAvailability } from './TerminalAvailability'

export interface CommandRunnerDependencies {
  segments: SegmentFinder
  reachability: ReachabilityChecker
  dns: DnsResolver
  dhcp: DhcpService
  formatter: CommandFormatter
}

const LOCAL_TTL = 128
const ROUTED_TTL = 127
const INTERNET_TTL = 117
const LOCAL_TIME_MS = 1
const ROUTED_TIME_MS = 2
const INTERNET_TIME_MS = 14

/**
 * Parses a terminal line and runs it against the engine (PLAN §4.6).
 * The returned lines never include an echo of the typed command; the UI shows the input itself.
 */
export class CommandRunner {
  private readonly deps: CommandRunnerDependencies

  constructor(deps: CommandRunnerDependencies) {
    this.deps = deps
  }

  run(state: NetworkState, deviceId: string, commandLine: string): CommandResult {
    const device = DeviceLookup.require(state, deviceId)
    const [rawCommand, ...args] = commandLine.trim().split(/\s+/).filter((token) => token !== '')
    if (rawCommand === undefined) return { lines: [] }
    const command = rawCommand.toLowerCase()
    const { formatter } = this.deps

    if (command === 'help') return { lines: formatter.help() }
    if (command !== 'ipconfig' && command !== 'ping' && command !== 'nslookup') {
      return { lines: formatter.unknownCommand(rawCommand) }
    }
    if (!device.host || !TerminalAvailability.isAvailable(device)) return { lines: formatter.noTerminal() }
    if (!device.powered) return { lines: formatter.devicePoweredOff() }

    switch (command) {
      case 'ipconfig':
        return this.ipconfig(state, device, device.host, args)
      case 'ping':
        return { lines: this.ping(state, device, args) }
      case 'nslookup':
        return { lines: this.nslookup(state, device, args) }
    }
  }

  private ipconfig(state: NetworkState, device: Device, host: HostNetworkConfig, args: string[]): CommandResult {
    const option = args[0]?.toLowerCase()
    const { formatter } = this.deps
    if (option === undefined) return { lines: formatter.ipconfig(this.adapterView(state, device, host), false) }
    if (option === '/all') return { lines: formatter.ipconfig(this.adapterView(state, device, host), true) }
    if (option === '/renew') return this.renew(state, device)
    return { lines: formatter.unknownOption(args[0] ?? '') }
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
    // Static address, unplugged cable or disabled port: Windows refuses to renew.
    return { lines: formatter.renewNotPermitted() }
  }

  private ping(state: NetworkState, device: Device, args: string[]): TerminalLine[] {
    const { formatter } = this.deps
    const target = args[0]
    if (target === undefined) return formatter.usage('ping <ip adresi veya ad>  (örnek: ping 8.8.8.8)')

    let targetIp = target
    let resolvedName: string | null = null
    if (!Ipv4.isValid(target)) {
      const resolved = this.deps.dns.resolve(state, device.id, target)
      if (!resolved.ok) return formatter.pingHostNotFound(target)
      targetIp = resolved.ip
      resolvedName = target
    }
    const reach = this.deps.reachability.reach(state, device.id, targetIp)
    return formatter.ping(targetIp, resolvedName, this.pingOutcome(state, device, targetIp, reach))
  }

  private pingOutcome(state: NetworkState, device: Device, targetIp: string, reach: ReachResult): PingOutcome {
    const host = device.host
    const ownIp = host?.ip ?? ''
    if (reach.ok) return this.replyOutcome(state, targetIp, reach.path)

    switch (reach.reason) {
      case 'destinationNotInSegment':
      case 'noRouteToDestination':
        // Sent by the host itself (ARP failed) or by the router that could not deliver it.
        return reach.atDeviceId === device.id
          ? { kind: 'unreachable', fromIp: ownIp }
          : { kind: 'unreachable', fromIp: host?.gateway ?? ownIp }
      case 'gatewayOutsideSubnet':
        return { kind: 'unreachable', fromIp: ownIp }
      case 'gatewayUnreachable':
        // Gateway not answering ARP → own IP; destination with no route back → silence.
        return reach.atDeviceId === device.id ? { kind: 'unreachable', fromIp: ownIp } : { kind: 'timeout' }
      case 'cableDisconnected':
      case 'portDisabled':
      case 'noIpAddress':
      case 'invalidConfig':
      case 'gatewayNotSet':
        return { kind: 'generalFailure' }
      default:
        return { kind: 'timeout' }
    }
  }

  private replyOutcome(state: NetworkState, targetIp: string, path: string[]): PingOutcome {
    if (Ipv4.isPublic(targetIp)) {
      return { kind: 'reply', fromIp: targetIp, ttl: INTERNET_TTL, baseTimeMs: INTERNET_TIME_MS }
    }
    const routed = path
      .slice(1, -1)
      .some((deviceId) => DeviceLookup.find(state, deviceId)?.kind === 'router')
    return routed
      ? { kind: 'reply', fromIp: targetIp, ttl: ROUTED_TTL, baseTimeMs: ROUTED_TIME_MS }
      : { kind: 'reply', fromIp: targetIp, ttl: LOCAL_TTL, baseTimeMs: LOCAL_TIME_MS }
  }

  private nslookup(state: NetworkState, device: Device, args: string[]): TerminalLine[] {
    const { formatter } = this.deps
    const name = args[0]
    if (name === undefined) return formatter.usage('nslookup <ad>  (örnek: nslookup google.com)')
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
    const attachment = this.deps.segments.attachment(state, device)
    return {
      hostName: device.id.toUpperCase(),
      wireless: attachment.ok ? attachment.portId === 'wlan0' : this.isWireless(state, device.id),
      connected: attachment.ok,
      mac: device.mac,
      host,
    }
  }

  /** True when the device only has a Wi-Fi link (no Ethernet cable at all). */
  private isWireless(state: NetworkState, deviceId: string): boolean {
    const ports = state.links.flatMap((link) => [link.a, link.b]).filter((end) => end.deviceId === deviceId)
    return !ports.some((end) => end.portId === 'eth0') && ports.some((end) => end.portId === 'wlan0')
  }
}
