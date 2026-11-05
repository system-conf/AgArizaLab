import type { DeviceV2, LinkV2, NetworkStateV2 } from '../../domain/v2'
import { Ipv4 } from '../Ipv4'
import { type L3Interface, L3Interfaces } from './L3Interfaces'
import { type FarEnd, TopologyV2 } from './TopologyV2'
import { VlanRules, type WireTag } from './VlanRules'

/** Where a frame is inside the layer-2 domain. */
type Node =
  /** Inside a bridging device (switch, AP, wireless router LAN) in one VLAN. */
  | { type: 'bridge'; deviceId: string; vlan: number }
  /** Inside a hub, which repeats the frame unchanged (tag included). */
  | { type: 'hub'; deviceId: string; tag: WireTag }
  /** Delivered to a layer-3 interface (leaf, except the start). */
  | { type: 'endpoint'; iface: L3Interface }

/** The layer-2 broadcast domain of one interface (MODEL_V2 §13). */
export interface SegmentV2 {
  start: L3Interface
  /** Layer-3 interfaces in the domain, in discovery order; the start first. */
  members: L3Interface[]
  /** BFS tree over node keys; the start maps to null. */
  parents: ReadonlyMap<string, string | null>
  deviceOfNode: ReadonlyMap<string, string>
}

function nodeKey(node: Node): string {
  switch (node.type) {
    case 'bridge':
      return `b|${node.deviceId}|${node.vlan}`
    case 'hub':
      return `h|${node.deviceId}|${node.tag ?? 'untagged'}`
    case 'endpoint':
      return `e|${L3Interfaces.key(node.iface)}`
  }
}

function deviceOf(node: Node): string {
  return node.type === 'endpoint' ? node.iface.deviceId : node.deviceId
}

/**
 * Finds layer-2 domains by following frames: access / trunk tagging with native and allowed VLANs,
 * the VLAN database, dot1Q sub-interfaces, SVIs, SSID → VLAN on radios and hubs repeating
 * everything. Only links that are up count (TopologyV2.isUp). Results are cached per state.
 */
export class SegmentFinderV2 {
  private readonly cache = new WeakMap<NetworkStateV2, Map<string, SegmentV2>>()

  segment(state: NetworkStateV2, start: L3Interface): SegmentV2 {
    let perState = this.cache.get(state)
    if (!perState) {
      perState = new Map()
      this.cache.set(state, perState)
    }
    const key = L3Interfaces.key(start)
    let segment = perState.get(key)
    if (!segment) {
      segment = this.search(TopologyV2.of(state), start)
      perState.set(key, segment)
    }
    return segment
  }

  /** Device ids from the segment start to `target` (consecutive repeats collapsed); empty when not a member. */
  pathTo(segment: SegmentV2, target: L3Interface): string[] {
    let current: string | null | undefined = nodeKey({ type: 'endpoint', iface: target })
    if (!segment.parents.has(current)) return []
    const path: string[] = []
    while (current !== null && current !== undefined) {
      const deviceId = segment.deviceOfNode.get(current)
      if (deviceId !== undefined && path[0] !== deviceId) path.unshift(deviceId)
      current = segment.parents.get(current)
    }
    return path
  }

  /**
   * The interface that answers ARP for `ip`. A router-side interface always keeps (defends) its
   * address. NICs give up an address they share with another member (duplicate address detection)
   * and never use a network or broadcast address, so in those cases nobody answers.
   */
  findAddress(state: NetworkStateV2, segment: SegmentV2, ip: string): L3Interface | undefined {
    const claimants = this.poweredMembers(state, segment).filter((member) => member.address === ip)
    const networkSide = claimants.find((member) => L3Interfaces.isNetworkSide(member))
    if (networkSide) return networkSide
    const [only, ...others] = claimants
    if (!only || others.length > 0) return undefined
    return Ipv4.isHostAddress(only.address, only.mask) ? only : undefined
  }

  /** Another powered device in the segment that uses `ip` (Windows detects it with an ARP probe). */
  conflictingInterface(state: NetworkStateV2, segment: SegmentV2, deviceId: string, ip: string): L3Interface | undefined {
    return this.poweredMembers(state, segment).find((member) => member.deviceId !== deviceId && member.address === ip)
  }

  private poweredMembers(state: NetworkStateV2, segment: SegmentV2): L3Interface[] {
    const topology = TopologyV2.of(state)
    return segment.members.filter((member) => topology.find(member.deviceId)?.powered === true)
  }

  private search(topology: TopologyV2, start: L3Interface): SegmentV2 {
    const startNode: Node = { type: 'endpoint', iface: start }
    const startKey = nodeKey(startNode)
    const parents = new Map<string, string | null>([[startKey, null]])
    const deviceOfNode = new Map<string, string>([[startKey, start.deviceId]])
    const members: L3Interface[] = [start]
    const queue: Node[] = [startNode]

    for (let node = queue.shift(); node !== undefined; node = queue.shift()) {
      const parentKey = nodeKey(node)
      for (const next of this.neighbours(topology, node, node === startNode)) {
        const key = nodeKey(next)
        if (parents.has(key)) continue
        parents.set(key, parentKey)
        deviceOfNode.set(key, deviceOf(next))
        if (next.type === 'endpoint') members.push(next.iface)
        else queue.push(next)
      }
    }
    return { start, members, parents, deviceOfNode }
  }

  private neighbours(topology: TopologyV2, node: Node, isStart: boolean): Node[] {
    switch (node.type) {
      case 'endpoint':
        return isStart ? this.fromEndpoint(topology, node.iface) : []
      case 'bridge':
        return this.fromBridge(topology, node.deviceId, node.vlan)
      case 'hub':
        return this.fromHub(topology, node.deviceId, node.tag)
    }
  }

  private fromEndpoint(topology: TopologyV2, iface: L3Interface): Node[] {
    const device = topology.find(iface.deviceId)
    if (!device?.powered || !iface.adminUp) return []
    if (iface.kind === 'svi') {
      const vlan = iface.vlan ?? 0
      return VlanRules.inDatabase(device, vlan) ? [{ type: 'bridge', deviceId: device.id, vlan }] : []
    }
    if (iface.portId === undefined) return []
    const tag: WireTag = iface.kind === 'subInterface' && !iface.native ? (iface.vlan ?? null) : null
    return this.across(topology, topology.linksAt(device.id, iface.portId), device.id, iface.portId, tag)
  }

  private fromBridge(topology: TopologyV2, deviceId: string, vlan: number): Node[] {
    const device = topology.find(deviceId)
    if (!device) return []
    const next: Node[] = L3Interfaces.of(device)
      .filter((iface) => iface.kind === 'svi' && iface.vlan === vlan && iface.adminUp)
      .map((iface) => ({ type: 'endpoint', iface }))
    for (const link of topology.linksOf(deviceId)) {
      const own = topology.ownEnd(link, deviceId)
      const port = device.ports.find((candidate) => candidate.id === own.portId)
      if (port?.role === 'switched') {
        const tag = VlanRules.egress(device, port, vlan)
        if (tag !== undefined) next.push(...this.across(topology, [link], deviceId, port.id, tag))
      } else if (port?.role === 'radio' && link.cable === 'wireless' && this.ssidVlan(device, link.ssid) === vlan) {
        next.push(...this.across(topology, [link], deviceId, port.id, null))
      }
    }
    return next
  }

  private fromHub(topology: TopologyV2, deviceId: string, tag: WireTag): Node[] {
    return topology.linksOf(deviceId).flatMap((link) => {
      const own = topology.ownEnd(link, deviceId)
      return this.across(topology, [link], deviceId, own.portId, tag)
    })
  }

  /** Frames sent out of `portId` with `tag` over the links that are up, as they arrive at the far ends. */
  private across(topology: TopologyV2, links: readonly LinkV2[], deviceId: string, portId: string, tag: WireTag): Node[] {
    const arrivals: Node[] = []
    for (const link of links) {
      if (!topology.isUp(link)) continue
      const arrival = this.arrive(topology.farEnd(link, deviceId, portId), tag)
      if (arrival) arrivals.push(arrival)
    }
    return arrivals
  }

  private arrive(far: FarEnd, tag: WireTag): Node | null {
    const { device, port, link } = far
    if (!device || !port) return null
    switch (port.role) {
      case 'switched': {
        const vlan = VlanRules.ingress(device, port, tag)
        return vlan === null ? null : { type: 'bridge', deviceId: device.id, vlan }
      }
      case 'radio': {
        const vlan = link.cable === 'wireless' && tag === null ? this.ssidVlan(device, link.ssid) : null
        return vlan !== null && VlanRules.inDatabase(device, vlan) ? { type: 'bridge', deviceId: device.id, vlan } : null
      }
      case 'routed':
      case 'host': {
        const iface = this.receivingInterface(device, port.id, tag)
        return iface ? { type: 'endpoint', iface } : null
      }
      case 'passive':
        return device.kind === 'hub' ? { type: 'hub', deviceId: device.id, tag } : null
      case 'console':
        return null
    }
  }

  /** Untagged → native sub-interface or the port itself; tagged v → the sub-interface for v. */
  private receivingInterface(device: DeviceV2, portId: string, tag: WireTag): L3Interface | undefined {
    const onPort = L3Interfaces.of(device).filter((iface) => iface.portId === portId)
    const subInterfaces = onPort.filter((iface) => iface.kind === 'subInterface' && iface.adminUp)
    if (tag === null) {
      return subInterfaces.find((iface) => iface.native) ?? onPort.find((iface) => iface.kind === 'nic' || iface.kind === 'routed')
    }
    return subInterfaces.find((iface) => iface.vlan === tag)
  }

  private ssidVlan(device: DeviceV2, ssid: string): number | null {
    return device.wireless?.ssids.find((entry) => entry.ssid === ssid)?.vlan ?? null
  }
}
