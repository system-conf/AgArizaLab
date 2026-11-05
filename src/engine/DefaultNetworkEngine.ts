import type {
  AppLinkStatus,
  CommandResult,
  DhcpResult,
  LinkLight,
  NetworkEngine,
  ReachResult,
  ResolveResult,
} from '../domain/EngineContract'
import type { NetworkState } from '../domain/NetworkTypes'
import { AppLinkChecker } from './AppLinkChecker'
import { CommandFormatter } from './CommandFormatter'
import { CommandRunner } from './CommandRunner'
import { DhcpService } from './DhcpService'
import { DnsResolver } from './DnsResolver'
import { LinkLightChecker } from './LinkLightChecker'
import { ReachabilityChecker } from './ReachabilityChecker'
import { SegmentFinder } from './SegmentFinder'

/** The pure, stateless engine: wires the single-purpose classes together. */
export class DefaultNetworkEngine implements NetworkEngine {
  private readonly reachability: ReachabilityChecker
  private readonly dns: DnsResolver
  private readonly appLinks: AppLinkChecker
  private readonly dhcp: DhcpService
  private readonly commands: CommandRunner
  private readonly linkLights = new LinkLightChecker()

  constructor() {
    const segments = new SegmentFinder()
    this.reachability = new ReachabilityChecker(segments)
    this.dns = new DnsResolver(this.reachability)
    this.appLinks = new AppLinkChecker(this.reachability)
    this.dhcp = new DhcpService(segments)
    this.commands = new CommandRunner({
      segments,
      reachability: this.reachability,
      dns: this.dns,
      dhcp: this.dhcp,
      formatter: new CommandFormatter(),
    })
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

  renewDhcp(state: NetworkState, deviceId: string): DhcpResult {
    return this.dhcp.renew(state, deviceId)
  }

  runCommand(state: NetworkState, deviceId: string, commandLine: string): CommandResult {
    return this.commands.run(state, deviceId, commandLine)
  }

  linkLight(state: NetworkState, linkId: string): LinkLight {
    return this.linkLights.light(state, linkId)
  }
}
