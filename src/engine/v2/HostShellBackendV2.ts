import type { DeviceV2, NetworkStateV2, ResolveResultV2 } from '../../domain/v2'
import type { AdapterView } from '../CommandFormatter'
import type { HostShellBackend, ShellDhcpResult, TerminalAccess } from '../HostCommandShell'
import type { ProbeReport, ResolvedTarget } from '../ProbeReports'
import type { DhcpFailureV2, DhcpServiceV2 } from './DhcpServiceV2'
import type { DnsResolverV2 } from './DnsResolverV2'
import { HostAttachmentV2 } from './HostAttachmentV2'
import type { L3Interface } from './L3Interfaces'
import type { ProbeReporterV2 } from './ProbeReporterV2'
import type { SegmentFinderV2 } from './SegmentFinderV2'
import { TerminalAvailabilityV2 } from './TerminalAvailabilityV2'
import { TopologyV2 } from './TopologyV2'

export interface HostShellBackendV2Dependencies {
  segments: SegmentFinderV2
  dns: DnsResolverV2
  dhcp: DhcpServiceV2
  prober: ProbeReporterV2
}

/** The host command prompt on a v2 state: one adapter per active NIC. */
export class HostShellBackendV2 implements HostShellBackend<NetworkStateV2> {
  private readonly deps: HostShellBackendV2Dependencies

  constructor(deps: HostShellBackendV2Dependencies) {
    this.deps = deps
  }

  access(state: NetworkStateV2, deviceId: string): TerminalAccess {
    const device = TopologyV2.of(state).require(deviceId)
    if (!TerminalAvailabilityV2.isAvailable(device)) return 'noTerminal'
    return device.powered ? 'ready' : 'poweredOff'
  }

  adapters(state: NetworkStateV2, deviceId: string): AdapterView[] {
    const topology = TopologyV2.of(state)
    const device = topology.require(deviceId)
    return HostAttachmentV2.activeNics(topology, device).map((nic) => this.adapterView(state, device, nic))
  }

  renew(state: NetworkStateV2, deviceId: string): ShellDhcpResult<NetworkStateV2> {
    const result = this.deps.dhcp.renew(state, deviceId)
    return result.ok ? { ok: true, nextState: result.nextState } : this.failure(state, deviceId, result)
  }

  release(state: NetworkStateV2, deviceId: string): ShellDhcpResult<NetworkStateV2> {
    const result = this.deps.dhcp.release(state, deviceId)
    return result.ok ? { ok: true, nextState: result.nextState } : this.failure(state, deviceId, result)
  }

  resolve(state: NetworkStateV2, deviceId: string, name: string): ResolveResultV2 {
    return this.deps.dns.resolve(state, deviceId, name)
  }

  resolveTarget(state: NetworkStateV2, deviceId: string, target: string): ResolvedTarget {
    return this.deps.prober.resolveTarget(state, deviceId, target)
  }

  probe(state: NetworkStateV2, deviceId: string, targetIp: string): ProbeReport {
    return this.deps.prober.probe(state, deviceId, targetIp)
  }

  private failure(state: NetworkStateV2, deviceId: string, failure: DhcpFailureV2): ShellDhcpResult<NetworkStateV2> {
    const device = TopologyV2.of(state).require(deviceId)
    const portId = failure.portId ?? HostAttachmentV2.activeNics(TopologyV2.of(state), device)[0]?.portId
    return { ok: false, reason: failure.reason, wireless: this.isWireless(device, portId) }
  }

  private adapterView(state: NetworkStateV2, device: DeviceV2, nic: L3Interface): AdapterView {
    const topology = TopologyV2.of(state)
    const connected = HostAttachmentV2.attach(topology, nic).ok
    const port = device.ports.find((candidate) => candidate.id === nic.portId)
    return {
      hostName: device.id.toUpperCase(),
      wireless: this.isWireless(device, nic.portId),
      connected,
      mac: port?.mac ?? device.baseMac,
      host: {
        mode: nic.addressing,
        ip: nic.address,
        mask: nic.mask,
        gateway: device.host?.defaultGateway ?? '',
        dns: device.host?.dnsServers ?? [],
      },
      duplicateAddress: connected && device.powered && nic.address !== '' && this.hasConflict(state, nic),
    }
  }

  private hasConflict(state: NetworkStateV2, nic: L3Interface): boolean {
    const { segments } = this.deps
    return segments.conflictingInterface(state, segments.segment(state, nic), nic.deviceId, nic.address) !== undefined
  }

  private isWireless(device: DeviceV2, portId: string | undefined): boolean {
    return device.ports.find((port) => port.id === portId)?.medium === 'wireless'
  }
}
