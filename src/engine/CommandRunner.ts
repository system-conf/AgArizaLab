import type { CommandResult } from '../domain/EngineContract'
import type { NetworkState } from '../domain/NetworkTypes'
import type { CommandFormatter } from './CommandFormatter'
import type { DhcpService } from './DhcpService'
import type { DnsResolver } from './DnsResolver'
import { HostCommandShell } from './HostCommandShell'
import { HostShellBackendV1 } from './HostShellBackendV1'
import type { ReachabilityChecker } from './ReachabilityChecker'
import type { SegmentFinder } from './SegmentFinder'

export interface CommandRunnerDependencies {
  segments: SegmentFinder
  reachability: ReachabilityChecker
  dns: DnsResolver
  dhcp: DhcpService
  formatter: CommandFormatter
}

/**
 * Parses a terminal line and runs it against a v1 state (PLAN §4.6). The command logic itself is
 * the model-independent HostCommandShell, shared with the v2 engine.
 */
export class CommandRunner {
  private readonly shell: HostCommandShell<NetworkState>

  constructor(deps: CommandRunnerDependencies) {
    this.shell = new HostCommandShell(new HostShellBackendV1(deps), deps.formatter)
  }

  run(state: NetworkState, deviceId: string, commandLine: string): CommandResult {
    return this.shell.run(state, deviceId, commandLine)
  }
}
