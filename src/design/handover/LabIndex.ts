import type { Device, DeviceKind, Link, NetworkState } from '../../domain'
import { type L3Interface, Topology } from '../../engine'
import type { DeviceRef } from './HandoverTypes'

/** Ranks devices for orientation: the network side of a cable comes first (lower = more central). */
const NETWORK_RANK: Partial<Record<DeviceKind, number>> = {
  l3Switch: 0,
  switch: 1,
  wirelessRouter: 2,
  router: 3,
  accessPoint: 4,
  hub: 5,
  internet: 6,
}
const END_DEVICE_RANK = 10

/** Read-only lookups over one lab state shared by the handover builders. */
export class LabIndex {
  readonly state: NetworkState
  readonly topology: Topology
  private readonly order: ReadonlyMap<string, number>

  constructor(state: NetworkState) {
    this.state = state
    this.topology = Topology.of(state)
    this.order = new Map(state.devices.map((device, index) => [device.id, index]))
  }

  ref(deviceId: string): DeviceRef {
    return { deviceId, deviceName: this.topology.find(deviceId)?.name ?? deviceId }
  }

  /** Lab order of a device (unknown ids last). */
  orderOf(deviceId: string): number {
    return this.order.get(deviceId) ?? Number.MAX_SAFE_INTEGER
  }

  networkRank(deviceId: string): number {
    const kind = this.topology.find(deviceId)?.kind
    return kind === undefined ? END_DEVICE_RANK : (NETWORK_RANK[kind] ?? END_DEVICE_RANK)
  }

  /** Ids of the ports of `device` that have a cable (plugged or not). */
  cabledPorts(device: Device): string[] {
    return device.ports.filter((port) => this.topology.linksAt(device.id, port.id).length > 0).map((port) => port.id)
  }

  /**
   * VLAN of a layer-3 interface: its own VLAN (sub-interface, SVI), else what its cable leads to —
   * the access VLAN (trunk: native VLAN) of a switchport, or the VLAN of the SSID it joined.
   * Undefined when nothing tells (router to router, hub, not cabled).
   */
  vlanOf(iface: L3Interface): number | undefined {
    if (iface.vlan !== undefined) return iface.vlan
    if (iface.portId === undefined) return undefined
    for (const link of this.topology.linksAt(iface.deviceId, iface.portId)) {
      const vlan = this.vlanAcross(link, iface.deviceId, iface.portId)
      if (vlan !== undefined) return vlan
    }
    return undefined
  }

  /** The interface's cable leads to the internet cloud (a WAN port: the provider assigns its address). */
  facesProvider(iface: L3Interface): boolean {
    if (iface.portId === undefined) return false
    const portId = iface.portId
    return this.topology.linksAt(iface.deviceId, portId).some((link) => this.topology.farEnd(link, iface.deviceId, portId).device?.kind === 'internet')
  }

  private vlanAcross(link: Link, deviceId: string, portId: string): number | undefined {
    const far = this.topology.farEnd(link, deviceId, portId)
    if (link.cable === 'wireless') return far.device?.wireless?.ssids.find((entry) => entry.ssid === link.ssid)?.vlan
    if (far.port?.role !== 'switched') return undefined
    return far.port.l2.mode === 'access' ? far.port.l2.accessVlan : far.port.l2.nativeVlan
  }

  /** Natural order of port ids: 'Fa0/2' before 'Fa0/10', 'Gi0/0' before 'Gi0/0.10'. */
  static comparePorts(a: string, b: string): number {
    return a.localeCompare(b, 'en', { numeric: true })
  }
}
