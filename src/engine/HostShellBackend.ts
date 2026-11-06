import type { NetworkState, ResolveResult } from '../domain'
import type { AdapterView } from './CommandFormatter'
import type { ShellBackend, ShellDhcpResult, TerminalAccess } from './HostCommandShell'
import type { ProbeReport, ResolvedTarget } from './ProbeReports'
import type { DhcpFailure, DhcpService } from './DhcpService'
import type { DnsResolver } from './DnsResolver'
import { HostAdapters } from './HostAdapters'
import { HostAttachment } from './HostAttachment'
import type { L3Interface } from './L3Interfaces'
import type { ProbeReporter } from './ProbeReporter'
import type { SegmentFinder } from './SegmentFinder'
import { TerminalAvailability } from './TerminalAvailability'
import { Topology } from './Topology'

export interface HostShellBackendDependencies {
  segments: SegmentFinder
  dns: DnsResolver
  dhcp: DhcpService
  prober: ProbeReporter
}

/** The host command prompt on a network state: one adapter per active NIC. */
export class HostShellBackend implements ShellBackend {
  private readonly deps: HostShellBackendDependencies

  constructor(deps: HostShellBackendDependencies) {
    this.deps = deps
  }

  access(state: NetworkState, deviceId: string): TerminalAccess {
    const device = Topology.of(state).require(deviceId)
    if (!TerminalAvailability.isAvailable(device)) return 'noTerminal'
    return device.powered ? 'ready' : 'poweredOff'
  }

  adapters(state: NetworkState, deviceId: string): AdapterView[] {
    return HostAdapters.views(state, deviceId, (nic) => this.hasConflict(state, nic))
  }

  renew(state: NetworkState, deviceId: string): ShellDhcpResult {
    const result = this.deps.dhcp.renew(state, deviceId)
    return result.ok ? { ok: true, nextState: result.nextState } : this.failure(state, deviceId, result)
  }

  release(state: NetworkState, deviceId: string): ShellDhcpResult {
    const result = this.deps.dhcp.release(state, deviceId)
    return result.ok ? { ok: true, nextState: result.nextState } : this.failure(state, deviceId, result)
  }

  resolve(state: NetworkState, deviceId: string, name: string): ResolveResult {
    return this.deps.dns.resolve(state, deviceId, name)
  }

  resolveTarget(state: NetworkState, deviceId: string, target: string): ResolvedTarget {
    return this.deps.prober.resolveTarget(state, deviceId, target)
  }

  probe(state: NetworkState, deviceId: string, targetIp: string): ProbeReport {
    return this.deps.prober.probe(state, deviceId, targetIp)
  }

  private failure(state: NetworkState, deviceId: string, failure: DhcpFailure): ShellDhcpResult {
    const device = Topology.of(state).require(deviceId)
    const portId = failure.portId ?? HostAttachment.activeNics(Topology.of(state), device)[0]?.portId
    return { ok: false, reason: failure.reason, wireless: HostAdapters.isWireless(device, portId) }
  }

  private hasConflict(state: NetworkState, nic: L3Interface): boolean {
    const { segments } = this.deps
    return segments.conflictingInterface(state, segments.segment(state, nic), nic.deviceId, nic.address) !== undefined
  }
}
