import type { ResolveResult } from '../domain/EngineContract'
import type { NetworkState } from '../domain/NetworkTypes'
import type { AdapterView } from './CommandFormatter'
import { DeviceLookup } from './DeviceLookup'
import type { DhcpReleaseResult, DhcpService } from './DhcpService'
import type { DnsResolver } from './DnsResolver'
import type { HostShellBackend, ShellDhcpResult, TerminalAccess } from './HostCommandShell'
import { ProbeReporter } from './ProbeReporter'
import type { ProbeReport, ResolvedTarget } from './ProbeReports'
import type { ReachabilityChecker } from './ReachabilityChecker'
import type { SegmentFinder } from './SegmentFinder'
import { TerminalAvailability } from './TerminalAvailability'

export interface HostShellBackendV1Dependencies {
  segments: SegmentFinder
  reachability: ReachabilityChecker
  dns: DnsResolver
  dhcp: DhcpService
}

/** The host command prompt on a v1 state: one adapter per host. */
export class HostShellBackendV1 implements HostShellBackend<NetworkState> {
  private readonly deps: HostShellBackendV1Dependencies
  private readonly prober: ProbeReporter

  constructor(deps: HostShellBackendV1Dependencies) {
    this.deps = deps
    this.prober = new ProbeReporter(deps.reachability, deps.dns)
  }

  access(state: NetworkState, deviceId: string): TerminalAccess {
    const device = DeviceLookup.require(state, deviceId)
    if (!device.host || !TerminalAvailability.isAvailable(device)) return 'noTerminal'
    return device.powered ? 'ready' : 'poweredOff'
  }

  adapters(state: NetworkState, deviceId: string): AdapterView[] {
    const device = DeviceLookup.require(state, deviceId)
    if (!device.host) return []
    const { segments } = this.deps
    const attachment = segments.attachment(state, device)
    return [
      {
        hostName: device.id.toUpperCase(),
        wireless: attachment.ok ? attachment.portId === 'wlan0' : this.isWireless(state, device.id),
        connected: attachment.ok,
        mac: device.mac,
        host: device.host,
        duplicateAddress: segments.hasAddressConflict(state, device),
      },
    ]
  }

  renew(state: NetworkState, deviceId: string): ShellDhcpResult<NetworkState> {
    return this.withAdapter(state, deviceId, this.deps.dhcp.renew(state, deviceId))
  }

  release(state: NetworkState, deviceId: string): ShellDhcpResult<NetworkState> {
    return this.withAdapter(state, deviceId, this.deps.dhcp.release(state, deviceId))
  }

  resolve(state: NetworkState, deviceId: string, name: string): ResolveResult {
    return this.deps.dns.resolve(state, deviceId, name)
  }

  resolveTarget(state: NetworkState, deviceId: string, target: string): ResolvedTarget {
    return this.prober.resolveTarget(state, deviceId, target)
  }

  probe(state: NetworkState, deviceId: string, targetIp: string): ProbeReport {
    return this.prober.probe(state, deviceId, targetIp)
  }

  private withAdapter(state: NetworkState, deviceId: string, result: DhcpReleaseResult): ShellDhcpResult<NetworkState> {
    if (result.ok) return { ok: true, nextState: result.nextState }
    return { ok: false, reason: result.reason, wireless: this.isWireless(state, deviceId) }
  }

  /** True when the device only has a Wi-Fi link (no Ethernet cable at all). */
  private isWireless(state: NetworkState, deviceId: string): boolean {
    const ports = state.links.flatMap((link) => [link.a, link.b]).filter((end) => end.deviceId === deviceId)
    return !ports.some((end) => end.portId === 'eth0') && ports.some((end) => end.portId === 'wlan0')
  }
}
