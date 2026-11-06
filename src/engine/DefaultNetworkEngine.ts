import type {
  AppLinkStatus,
  CommandResult,
  DhcpResult,
  LinkLight,
  NetworkEngine,
  NetworkState,
  ReachResult,
  ResolveResult,
} from '../domain'
import { CommandFormatter } from './CommandFormatter'
import { HostCommandShell } from './HostCommandShell'
import { AppLinkChecker } from './AppLinkChecker'
import { DhcpService } from './DhcpService'
import { DnsResolver } from './DnsResolver'
import { HostShellBackend } from './HostShellBackend'
import { ProbeReporter } from './ProbeReporter'
import { ReachabilityChecker } from './ReachabilityChecker'
import { SegmentFinder } from './SegmentFinder'
import { Topology } from './Topology'

/** The pure, stateless engine (MODEL_V2 §13): wires the single-purpose classes together. */
export class DefaultNetworkEngine implements NetworkEngine {
  private readonly reachability: ReachabilityChecker
  private readonly dns: DnsResolver
  private readonly appLinks: AppLinkChecker
  private readonly dhcp: DhcpService
  private readonly shell: HostCommandShell

  constructor() {
    const segments = new SegmentFinder()
    this.reachability = new ReachabilityChecker(segments)
    this.dns = new DnsResolver(this.reachability)
    this.appLinks = new AppLinkChecker(this.reachability)
    this.dhcp = new DhcpService(segments)
    const prober = new ProbeReporter(this.reachability, this.dns)
    const backend = new HostShellBackend({ segments, dns: this.dns, dhcp: this.dhcp, prober })
    this.shell = new HostCommandShell(backend, new CommandFormatter())
  }

  reach(state: NetworkState, fromDeviceId: string, toIp: string): ReachResult {
    return this.reachability.reach(state, fromDeviceId, toIp)
  }

  resolve(state: NetworkState, fromDeviceId: string, name: string): ResolveResult {
    return this.dns.resolve(state, fromDeviceId, name)
  }

  appLinkStatus(state: NetworkState, deviceId: string): AppLinkStatus[] {
    return this.appLinks.status(state, deviceId)
  }

  renewDhcp(state: NetworkState, deviceId: string, portId?: string): DhcpResult {
    const result = this.dhcp.renew(state, deviceId, portId)
    return result.ok ? result : { ok: false, reason: result.reason }
  }

  runCommand(state: NetworkState, deviceId: string, commandLine: string): CommandResult {
    return this.shell.run(state, deviceId, commandLine)
  }

  /**
   * Physical link light: cable, power, port shutdown, cable / pinout fit and Wi-Fi SSID. IP, VLAN
   * and routing settings are ignored, so the light never gives away a configuration fault; a
   * provider outage keeps the light green like a modem without sync.
   */
  linkLight(state: NetworkState, linkId: string): LinkLight {
    const link = state.links.find((candidate) => candidate.id === linkId)
    if (!link) throw new Error(`Unknown link id: ${linkId}`)
    return Topology.of(state).isUp(link) ? 'up' : 'down'
  }
}
