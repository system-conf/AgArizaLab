import type { Device, Link, NetworkState } from '../domain'
import { Ipv4 } from './Ipv4'
import { type L3Interface, L3Interfaces } from './L3Interfaces'
import { type FarEnd, Topology } from './Topology'
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
export interface Segment {
  start: L3Interface
  /** Layer-3 interfaces in the domain, in discovery order; the start first. */
  members: L3Interface[]
  /** BFS tree over node keys; the start maps to null. */
  parents: ReadonlyMap<string, string | null>
  deviceOfNode: ReadonlyMap<string, string>
}

/** Where frames from one interface arrive (no check of the way back). */
interface OneWay extends Segment {
  /** Node keys reached over links that carry the answer straight back (see SegmentFinder). */
  mirrored: ReadonlySet<string>
}

/** A node reached over one link; `mirrored`: a frame sent back over that link lands in the sending node. */
interface Step {
  node: Node
  mirrored: boolean
}

/** Would a frame arriving with this tag on the port a step left from land in the sending node? */
type Landing = (tag: WireTag) => boolean

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
 * everything. Only links that are up count (Topology.isUp). Results are cached per state.
 *
 * Membership needs frames both ways, like IOS: a native sub-interface takes frames tagged with its VLAN
 * but answers untagged, which lands in the trunk's native VLAN; an interface it hears but cannot answer
 * (or that hears the start but cannot be answered) is not a member. The search notes which members
 * were reached over links that carry the answer straight back (the usual case); only the others get
 * a search of their own to see whether their answer finds the start.
 */
export class SegmentFinder {
  private readonly cache = new WeakMap<NetworkState, Map<string, Segment>>()
  /** One-way searches (where frames from an interface arrive), per state and start interface. */
  private readonly oneWay = new WeakMap<NetworkState, Map<string, OneWay>>()

  segment(state: NetworkState, start: L3Interface): Segment {
    return SegmentFinder.cached(this.cache, state, start, () => {
      const { mirrored, ...forward } = this.reachedFrom(state, start)
      const startKey = nodeKey({ type: 'endpoint', iface: start })
      const answers = (member: L3Interface): boolean =>
        member === start || mirrored.has(nodeKey({ type: 'endpoint', iface: member })) || this.reachedFrom(state, member).parents.has(startKey)
      return { ...forward, members: forward.members.filter(answers) }
    })
  }

  private reachedFrom(state: NetworkState, start: L3Interface): OneWay {
    return SegmentFinder.cached(this.oneWay, state, start, () => this.search(Topology.of(state), start))
  }

  private static cached<T>(cache: WeakMap<NetworkState, Map<string, T>>, state: NetworkState, start: L3Interface, build: () => T): T {
    let perState = cache.get(state)
    if (!perState) {
      perState = new Map()
      cache.set(state, perState)
    }
    const key = L3Interfaces.key(start)
    let segment = perState.get(key)
    if (!segment) {
      segment = build()
      perState.set(key, segment)
    }
    return segment
  }

  /** Device ids from the segment start to `target` (consecutive repeats collapsed); empty when not a member. */
  pathTo(segment: Segment, target: L3Interface): string[] {
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
   * The interface that answers ARP for `ip`. A router-side interface of a routing device always keeps
   * (defends) its address. NICs and the management SVIs of non-routing switches give up an address they
   * share with another member (duplicate address detection); NICs never use a network or broadcast
   * address. In those cases nobody answers.
   */
  findAddress(state: NetworkState, segment: Segment, ip: string): L3Interface | undefined {
    const topology = Topology.of(state)
    const claimants = this.poweredMembers(state, segment).filter((member) => member.address === ip)
    const defender = claimants.find((member) => {
      const device = topology.find(member.deviceId)
      return device !== undefined && !L3Interfaces.givesUpOnConflict(device, member)
    })
    if (defender) return defender
    const [only, ...others] = claimants
    if (!only || others.length > 0) return undefined
    return L3Interfaces.isNetworkSide(only) || Ipv4.isHostAddress(only.address, only.mask) ? only : undefined
  }

  /** Another powered device in the segment that uses `ip` (Windows detects it with an ARP probe). */
  conflictingInterface(state: NetworkState, segment: Segment, deviceId: string, ip: string): L3Interface | undefined {
    return this.poweredMembers(state, segment).find((member) => member.deviceId !== deviceId && member.address === ip)
  }

  private poweredMembers(state: NetworkState, segment: Segment): L3Interface[] {
    const topology = Topology.of(state)
    return segment.members.filter((member) => topology.find(member.deviceId)?.powered === true)
  }

  private search(topology: Topology, start: L3Interface): OneWay {
    const startNode: Node = { type: 'endpoint', iface: start }
    const startKey = nodeKey(startNode)
    const parents = new Map<string, string | null>([[startKey, null]])
    const deviceOfNode = new Map<string, string>([[startKey, start.deviceId]])
    const mirrored = new Set<string>([startKey])
    const members: L3Interface[] = [start]
    const queue: Node[] = [startNode]

    for (let index = 0; index < queue.length; index += 1) {
      const node = queue[index]
      if (node === undefined) break
      const parentKey = nodeKey(node)
      for (const step of this.neighbours(topology, node, node === startNode)) {
        const next = step.node
        const key = nodeKey(next)
        if (parents.has(key)) continue
        parents.set(key, parentKey)
        deviceOfNode.set(key, deviceOf(next))
        if (step.mirrored && mirrored.has(parentKey)) mirrored.add(key)
        if (next.type === 'endpoint') members.push(next.iface)
        else queue.push(next)
      }
    }
    return { start, members, parents, deviceOfNode, mirrored }
  }

  private neighbours(topology: Topology, node: Node, isStart: boolean): Step[] {
    switch (node.type) {
      case 'endpoint':
        return isStart ? this.fromEndpoint(topology, node.iface) : []
      case 'bridge':
        return this.fromBridge(topology, node.deviceId, node.vlan)
      case 'hub':
        return this.fromHub(topology, node.deviceId, node.tag)
    }
  }

  private fromEndpoint(topology: Topology, iface: L3Interface): Step[] {
    const device = topology.find(iface.deviceId)
    if (!device?.powered || !iface.adminUp) return []
    if (iface.kind === 'svi') {
      const vlan = iface.vlan ?? 0
      return VlanRules.inDatabase(device, vlan) ? [{ node: { type: 'bridge', deviceId: device.id, vlan }, mirrored: true }] : []
    }
    const { portId } = iface
    if (portId === undefined) return []
    const lands: Landing = (tag) => this.receivingInterface(device, portId, tag) === iface
    return this.across(topology, topology.linksAt(device.id, portId), device.id, portId, SegmentFinder.sendTag(iface), lands)
  }

  private fromBridge(topology: Topology, deviceId: string, vlan: number): Step[] {
    const device = topology.find(deviceId)
    if (!device) return []
    const next: Step[] = L3Interfaces.of(device)
      .filter((iface) => iface.kind === 'svi' && iface.vlan === vlan && iface.adminUp)
      .map((iface) => ({ node: { type: 'endpoint', iface }, mirrored: true }))
    for (const link of topology.linksOf(deviceId)) {
      const own = topology.ownEnd(link, deviceId)
      const port = device.ports.find((candidate) => candidate.id === own.portId)
      if (port?.role === 'switched') {
        const tag = VlanRules.egress(device, port, vlan)
        const lands: Landing = (back) => VlanRules.ingress(device, port, back) === vlan
        if (tag !== undefined) next.push(...this.across(topology, [link], deviceId, port.id, tag, lands))
      } else if (port?.role === 'radio' && link.cable === 'wireless' && this.ssidVlan(device, link.ssid) === vlan) {
        next.push(...this.across(topology, [link], deviceId, port.id, null, (back) => back === null))
      }
    }
    return next
  }

  private fromHub(topology: Topology, deviceId: string, tag: WireTag): Step[] {
    return topology.linksOf(deviceId).flatMap((link) => {
      const own = topology.ownEnd(link, deviceId)
      return this.across(topology, [link], deviceId, own.portId, tag, (back) => back === tag)
    })
  }

  /**
   * Frames sent out of `portId` with `tag` over the links that are up, as they arrive at the far ends;
   * mirrored when the far node's answer over the same link `lands` in the sending node.
   */
  private across(topology: Topology, links: readonly Link[], deviceId: string, portId: string, tag: WireTag, lands: Landing): Step[] {
    const steps: Step[] = []
    for (const link of links) {
      if (!topology.isUp(link)) continue
      const far = topology.farEnd(link, deviceId, portId)
      const node = this.arrive(far, tag)
      if (!node) continue
      const back = this.answerTag(far, node)
      steps.push({ node, mirrored: back !== undefined && lands(back) })
    }
    return steps
  }

  /** Tag of the far node's frames back over the link it was reached by; undefined = it sends none there. */
  private answerTag(far: FarEnd, node: Node): WireTag | undefined {
    switch (node.type) {
      case 'endpoint':
        return SegmentFinder.sendTag(node.iface)
      case 'hub':
        return node.tag
      case 'bridge':
        return far.device && far.port?.role === 'switched' ? VlanRules.egress(far.device, far.port, node.vlan) : null
    }
  }

  /** Sub-interfaces tag their frames unless native; everything else sends untagged. */
  private static sendTag(iface: L3Interface): WireTag {
    return iface.kind === 'subInterface' && !iface.native ? (iface.vlan ?? null) : null
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
  private receivingInterface(device: Device, portId: string, tag: WireTag): L3Interface | undefined {
    const onPort = L3Interfaces.of(device).filter((iface) => iface.portId === portId)
    const subInterfaces = onPort.filter((iface) => iface.kind === 'subInterface' && iface.adminUp)
    if (tag === null) {
      return subInterfaces.find((iface) => iface.native) ?? onPort.find((iface) => iface.kind === 'nic' || iface.kind === 'routed')
    }
    return subInterfaces.find((iface) => iface.vlan === tag)
  }

  private ssidVlan(device: Device, ssid: string): number | null {
    return device.wireless?.ssids.find((entry) => entry.ssid === ssid)?.vlan ?? null
  }
}
