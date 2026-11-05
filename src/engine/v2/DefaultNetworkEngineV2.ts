import type {
  AppLinkStatusV2,
  CommandResultV2,
  DhcpResultV2,
  NetworkEngineV2,
  NetworkStateV2,
  ReachResultV2,
  ResolveResultV2,
} from '../../domain/v2'
import type { LinkLight } from '../../domain/EngineContract'
import { CommandFormatter } from '../CommandFormatter'
import { HostCommandShell } from '../HostCommandShell'
import { AppLinkCheckerV2 } from './AppLinkCheckerV2'
import { DhcpServiceV2 } from './DhcpServiceV2'
import { DnsResolverV2 } from './DnsResolverV2'
import { HostShellBackendV2 } from './HostShellBackendV2'
import { ProbeReporterV2 } from './ProbeReporterV2'
import { ReachabilityCheckerV2 } from './ReachabilityCheckerV2'
import { SegmentFinderV2 } from './SegmentFinderV2'
import { TopologyV2 } from './TopologyV2'

/** The pure, stateless v2 engine (MODEL_V2 §13): wires the single-purpose classes together. */
export class DefaultNetworkEngineV2 implements NetworkEngineV2 {
  private readonly reachability: ReachabilityCheckerV2
  private readonly dns: DnsResolverV2
  private readonly appLinks: AppLinkCheckerV2
  private readonly dhcp: DhcpServiceV2
  private readonly shell: HostCommandShell<NetworkStateV2>

  constructor() {
    const segments = new SegmentFinderV2()
    this.reachability = new ReachabilityCheckerV2(segments)
    this.dns = new DnsResolverV2(this.reachability)
    this.appLinks = new AppLinkCheckerV2(this.reachability)
    this.dhcp = new DhcpServiceV2(segments)
    const prober = new ProbeReporterV2(this.reachability, this.dns)
    const backend = new HostShellBackendV2({ segments, dns: this.dns, dhcp: this.dhcp, prober })
    this.shell = new HostCommandShell(backend, new CommandFormatter())
  }

  reach(state: NetworkStateV2, fromDeviceId: string, toIp: string): ReachResultV2 {
    return this.reachability.reach(state, fromDeviceId, toIp)
  }

  resolve(state: NetworkStateV2, fromDeviceId: string, name: string): ResolveResultV2 {
    return this.dns.resolve(state, fromDeviceId, name)
  }

  appLinkStatus(state: NetworkStateV2, deviceId: string): AppLinkStatusV2[] {
    return this.appLinks.status(state, deviceId)
  }

  renewDhcp(state: NetworkStateV2, deviceId: string, portId?: string): DhcpResultV2 {
    const result = this.dhcp.renew(state, deviceId, portId)
    return result.ok ? result : { ok: false, reason: result.reason }
  }

  runCommand(state: NetworkStateV2, deviceId: string, commandLine: string): CommandResultV2 {
    return this.shell.run(state, deviceId, commandLine)
  }

  /**
   * Physical link light: cable, power, port shutdown, cable / pinout fit and Wi-Fi SSID. IP, VLAN
   * and routing settings are ignored, so the light never gives away a configuration fault; a
   * provider outage keeps the light green like a modem without sync.
   */
  linkLight(state: NetworkStateV2, linkId: string): LinkLight {
    const link = state.links.find((candidate) => candidate.id === linkId)
    if (!link) throw new Error(`Unknown link id: ${linkId}`)
    return TopologyV2.of(state).isUp(link) ? 'up' : 'down'
  }
}
