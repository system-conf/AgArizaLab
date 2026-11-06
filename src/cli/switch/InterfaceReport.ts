// `show interfaces status` and `show interfaces trunk`, Catalyst IOS 12.2 layout and column widths.
import { findDeviceModel } from '../../catalog/DeviceCatalog'
import type { Device, NetworkState, Port, RoutedPort, SwitchedPort } from '../../domain'
import { Topology } from '../../net/Topology'
import { InterfaceNames } from '../core/InterfaceNames'
import { LinkStatus } from '../core/LinkStatus'
import { VlanDatabase } from './VlanDatabase'
import { VlanLists } from './VlanLists'

type PhysicalPort = SwitchedPort | RoutedPort

/** Fastest speed per interface type when the catalog does not say. */
const TYPE_SPEEDS: Readonly<Record<string, number>> = { Ethernet: 10, FastEthernet: 100, GigabitEthernet: 1000, TenGigabitEthernet: 10000 }

function isPhysical(port: Port): port is PhysicalPort {
  return port.role === 'switched' || port.role === 'routed'
}

/** Highest speed (Mbit/s) the port can run at. */
function maxSpeed(device: Device, port: Port): number {
  const template = findDeviceModel(device.modelId)?.ports.find((candidate) => candidate.id === port.id)
  const speeds = template?.speedsMbps ?? []
  const fromCatalog = speeds[speeds.length - 1]
  if (fromCatalog !== undefined) return fromCatalog
  const type = InterfaceNames.parse(port.id)?.type
  return (type === undefined ? undefined : TYPE_SPEEDS[type]) ?? 100
}

/** '100', '1000', '10G' (IOS). */
function speedText(speed: number): string {
  return speed >= 10000 ? `${speed / 1000}G` : String(speed)
}

/** IOS media type column: '10/100BaseTX', '10/100/1000BaseTX', '1000BaseSX'. */
function mediaType(device: Device, port: PhysicalPort): string {
  const speed = maxSpeed(device, port)
  if (port.medium === 'fiber') return speed >= 10000 ? '10GBaseSR' : '1000BaseSX'
  if (speed >= 1000) return '10/100/1000BaseTX'
  return speed >= 100 ? '10/100BaseTX' : '10BaseT'
}

export class InterfaceReport {
  private readonly network: NetworkState
  private readonly device: Device

  constructor(network: NetworkState, device: Device) {
    this.network = LinkStatus.withDevice(network, device)
    this.device = device
  }

  /** `show interfaces status`: every switched / routed port. */
  status(): string[] {
    const header = 'Port      Name               Status       Vlan       Duplex  Speed Type'
    const rows = this.device.ports.filter(isPhysical).map((port) => {
      const connected = this.isUp(port)
      const status = !port.adminUp ? 'disabled' : connected ? 'connected' : 'notconnect'
      const vlan = port.role === 'routed' ? 'routed' : port.l2.mode === 'trunk' ? 'trunk' : String(port.l2.accessVlan)
      const columns = [
        port.id.padEnd(9),
        ' ',
        (port.description ?? '').slice(0, 18).padEnd(18),
        ' ',
        status.padEnd(12),
        ' ',
        vlan.padEnd(10),
        ' ',
        this.duplex(port, connected).padStart(6),
        ' ',
        this.speed(port, connected).padStart(6),
        ' ',
        mediaType(this.device, port),
      ]
      return columns.join('')
    })
    return [header, ...rows]
  }

  /** `show interfaces trunk`: the operational trunks (configured trunk, link up); nothing when there are none. */
  trunk(): string[] {
    const trunks = this.device.ports.filter(
      (port): port is SwitchedPort => port.role === 'switched' && port.l2.mode === 'trunk' && this.isUp(port),
    )
    if (trunks.length === 0) return []
    const known = new Set(VlanDatabase.entries(this.device).map((vlan) => vlan.id))
    const active = (port: SwitchedPort): string => {
      const ids = VlanLists.expand(port.l2.allowedVlans).filter((id) => known.has(id))
      return ids.length === 0 ? 'none' : VlanLists.compress(ids)
    }
    const section = (title: string, value: (port: SwitchedPort) => string): string[] => [
      '',
      `Port        ${title}`,
      ...trunks.map((port) => `${port.id.padEnd(11)} ${value(port)}`),
    ]
    return [
      'Port        Mode             Encapsulation  Status        Native vlan',
      ...trunks.map((port) => `${port.id.padEnd(11)} ${'on'.padEnd(16)} ${'802.1q'.padEnd(14)} ${'trunking'.padEnd(13)} ${port.l2.nativeVlan}`),
      ...section('Vlans allowed on trunk', (port) => VlanLists.describe(port.l2.allowedVlans)),
      ...section('Vlans allowed and active in management domain', active),
      // Until the STP pack every allowed, active VLAN forwards.
      ...section('Vlans in spanning tree forwarding state and not pruned', active),
    ]
  }

  private isUp(port: PhysicalPort): boolean {
    return LinkStatus.portUp(this.network, this.device, port.id)
  }

  private duplex(port: PhysicalPort, connected: boolean): string {
    const duplex = port.duplex ?? 'auto'
    if (duplex !== 'auto') return duplex
    return connected ? 'a-full' : 'auto'
  }

  /** Configured speed, or the negotiated one ('a-100'): the lower maximum of both ends. */
  private speed(port: PhysicalPort, connected: boolean): string {
    const configured = port.speed ?? 'auto'
    if (configured !== 'auto') return speedText(configured)
    if (!connected) return 'auto'
    return `a-${speedText(Math.min(maxSpeed(this.device, port), this.peerSpeed(port)))}`
  }

  private peerSpeed(port: PhysicalPort): number {
    const topology = Topology.of(this.network)
    for (const link of topology.linksAt(this.device.id, port.id)) {
      const far = topology.farEnd(link, this.device.id, port.id)
      if (far.device === undefined || far.port === undefined) continue
      const fixed = far.port.speed
      return fixed === undefined || fixed === 'auto' ? maxSpeed(far.device, far.port) : fixed
    }
    return maxSpeed(this.device, port)
  }
}
