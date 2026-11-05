import type { Device, Link, NetworkState } from '../domain/NetworkTypes'
import { DeviceLookup } from './DeviceLookup'
import { Ipv4 } from './Ipv4'

/** What one link end lets through (PLAN §4.1). */
type EndCarriage =
  | { kind: 'dead' }
  | { kind: 'all' }
  | { kind: 'vlan'; vlan: number }
  /** A host NIC: sends untagged frames, takes the VLAN of the other side. */
  | { kind: 'host' }

/** VLANs a whole link carries: every VLAN, exactly one, or none. */
type LinkVlans = 'all' | number | null

/** VLAN used for untagged host traffic on a trunk-like port (router lan, trunk, AP uplink). */
const NATIVE_VLAN = 1

const HOST_PORTS: readonly string[] = ['eth0', 'wlan0']

export type HostAttachment =
  | { ok: true; vlan: number; portId: string; neighborId: string }
  | { ok: false; reason: 'cableDisconnected' | 'portDisabled'; atDeviceId?: string }

/** Devices that share one layer-2 broadcast domain (one VLAN). */
export interface Segment {
  vlan: number
  startId: string
  /** Includes the start device. */
  members: Set<string>
  /** BFS tree used to rebuild display paths; the start maps to null. */
  parents: Map<string, string | null>
}

export class SegmentFinder {
  /** How a host is plugged in and which VLAN it lands in. */
  attachment(state: NetworkState, host: Device): HostAttachment {
    const hostLinks = state.links.filter((link) => this.hostPortOf(link, host.id) !== null)
    const connected = hostLinks.filter((link) => link.connected)
    if (connected.length === 0) return { ok: false, reason: 'cableDisconnected' }

    let firstFailure: HostAttachment | null = null
    for (const link of this.preferWired(connected, host.id)) {
      const result = this.attachThrough(state, host, link)
      if (result.ok) return result
      firstFailure ??= result
    }
    return firstFailure ?? { ok: false, reason: 'cableDisconnected' }
  }

  /** BFS from `startId` inside `vlan`, crossing only switches and access points. */
  segment(state: NetworkState, startId: string, vlan: number): Segment {
    const members = new Set<string>([startId])
    const parents = new Map<string, string | null>([[startId, null]])
    const queue: string[] = [startId]

    while (queue.length > 0) {
      const currentId = queue.shift()
      if (currentId === undefined) break
      const current = DeviceLookup.find(state, currentId)
      if (!current) continue
      if (currentId !== startId && !this.isLayer2(current)) continue

      for (const link of state.links) {
        const neighborId = this.otherEnd(link, currentId)
        if (neighborId === null || parents.has(neighborId)) continue
        if (!this.linkCarries(state, link, vlan)) continue
        const neighbor = DeviceLookup.find(state, neighborId)
        if (!neighbor || !this.joinsVlan(neighbor, vlan)) continue
        parents.set(neighborId, currentId)
        members.add(neighborId)
        queue.push(neighborId)
      }
    }
    return { vlan, startId, members, parents }
  }

  /**
   * The powered member of the segment that answers ARP for `ip`.
   * A router always keeps (defends) its interface address. Hosts give up an address they share
   * with another member (duplicate address detection) and never use a network or broadcast
   * address, so in those cases nobody answers.
   */
  findAddress(state: NetworkState, segment: Segment, ip: string): Device | undefined {
    const claimants = this.poweredMembers(state, segment).filter((device) => DeviceLookup.hasAddress(device, ip))
    const router = claimants.find((device) => device.kind === 'router')
    if (router) return router
    const [only, ...others] = claimants
    if (!only || others.length > 0) return undefined
    return only.host && Ipv4.isHostAddress(only.host.ip, only.host.mask) ? only : undefined
  }

  /**
   * Another powered member of the segment that already uses `ip`: a host with that address or a
   * router interface of the segment's VLAN. Windows detects it with an ARP probe and drops the address.
   */
  conflictingDevice(state: NetworkState, segment: Segment, deviceId: string, ip: string): Device | undefined {
    return this.poweredMembers(state, segment).find(
      (device) =>
        device.id !== deviceId &&
        (device.host?.ip === ip ||
          (device.routerInterfaces ?? []).some((routerInterface) => routerInterface.vlan === segment.vlan && routerInterface.ip === ip)),
    )
  }

  /** Device ids from the segment start to `targetId` (empty when not a member). */
  pathTo(segment: Segment, targetId: string): string[] {
    if (!segment.parents.has(targetId)) return []
    const path: string[] = []
    let current: string | null | undefined = targetId
    while (current !== null && current !== undefined) {
      path.unshift(current)
      current = segment.parents.get(current)
    }
    return path
  }

  /** True when the host's own address is also used by another device in its segment. */
  hasAddressConflict(state: NetworkState, host: Device): boolean {
    const ip = host.host?.ip ?? ''
    if (ip === '' || !host.powered) return false
    const attachment = this.attachment(state, host)
    if (!attachment.ok) return false
    return this.conflictingDevice(state, this.segment(state, host.id, attachment.vlan), host.id, ip) !== undefined
  }

  private poweredMembers(state: NetworkState, segment: Segment): Device[] {
    return [...segment.members]
      .map((memberId) => DeviceLookup.find(state, memberId))
      .filter((device): device is Device => device !== undefined && device.powered)
  }

  private attachThrough(state: NetworkState, host: Device, link: Link): HostAttachment {
    const hostPort = this.hostPortOf(link, host.id)
    const neighborEnd = link.a.deviceId === host.id ? link.b : link.a
    const neighbor = DeviceLookup.find(state, neighborEnd.deviceId)
    if (hostPort === null || !neighbor || !neighbor.powered) {
      return { ok: false, reason: 'cableDisconnected', atDeviceId: neighborEnd.deviceId }
    }
    if (neighbor.kind === 'switch') {
      const port = neighbor.switchPorts?.find((candidate) => candidate.id === neighborEnd.portId)
      if (!port || !port.enabled) {
        return { ok: false, reason: 'portDisabled', atDeviceId: neighbor.id }
      }
    }
    const vlans = this.linkVlans(state, link)
    if (typeof vlans !== 'number') {
      // A host end always narrows the link to one VLAN; anything else means no usable link.
      return { ok: false, reason: 'cableDisconnected', atDeviceId: neighbor.id }
    }
    return { ok: true, vlan: vlans, portId: hostPort, neighborId: neighbor.id }
  }

  private preferWired(links: Link[], hostId: string): Link[] {
    return [...links].sort((first, second) => {
      const firstRank = this.hostPortOf(first, hostId) === 'eth0' ? 0 : 1
      const secondRank = this.hostPortOf(second, hostId) === 'eth0' ? 0 : 1
      return firstRank - secondRank
    })
  }

  private hostPortOf(link: Link, hostId: string): string | null {
    if (link.a.deviceId === hostId && HOST_PORTS.includes(link.a.portId)) return link.a.portId
    if (link.b.deviceId === hostId && HOST_PORTS.includes(link.b.portId)) return link.b.portId
    return null
  }

  private otherEnd(link: Link, deviceId: string): string | null {
    if (link.a.deviceId === deviceId) return link.b.deviceId
    if (link.b.deviceId === deviceId) return link.a.deviceId
    return null
  }

  private isLayer2(device: Device): boolean {
    return device.kind === 'switch' || device.kind === 'accessPoint'
  }

  /** Routers belong to a VLAN only when they have an interface for it. */
  private joinsVlan(device: Device, vlan: number): boolean {
    if (device.kind !== 'router') return true
    return (device.routerInterfaces ?? []).some((routerInterface) => routerInterface.vlan === vlan)
  }

  private linkCarries(state: NetworkState, link: Link, vlan: number): boolean {
    const vlans = this.linkVlans(state, link)
    return vlans === 'all' || vlans === vlan
  }

  private linkVlans(state: NetworkState, link: Link): LinkVlans {
    if (!link.connected) return null
    const deviceA = DeviceLookup.find(state, link.a.deviceId)
    const deviceB = DeviceLookup.find(state, link.b.deviceId)
    if (!deviceA || !deviceB || !deviceA.powered || !deviceB.powered) return null
    return this.combine(
      this.endCarriage(deviceA, link.a.portId, link),
      this.endCarriage(deviceB, link.b.portId, link),
    )
  }

  private combine(first: EndCarriage, second: EndCarriage): LinkVlans {
    if (first.kind === 'dead' || second.kind === 'dead') return null
    if (first.kind === 'vlan' && second.kind === 'vlan') {
      return first.vlan === second.vlan ? first.vlan : null
    }
    if (first.kind === 'vlan') return first.vlan
    if (second.kind === 'vlan') return second.vlan
    if (first.kind === 'host' || second.kind === 'host') return NATIVE_VLAN
    return 'all'
  }

  private endCarriage(device: Device, portId: string, link: Link): EndCarriage {
    switch (device.kind) {
      case 'switch': {
        const port = device.switchPorts?.find((candidate) => candidate.id === portId)
        if (!port || !port.enabled) return { kind: 'dead' }
        return port.mode === 'trunk' ? { kind: 'all' } : { kind: 'vlan', vlan: port.vlan }
      }
      case 'router':
        return portId === 'lan' ? { kind: 'all' } : { kind: 'dead' }
      case 'accessPoint':
        return this.accessPointCarriage(device, portId, link)
      case 'internet':
        return { kind: 'dead' }
      default:
        return HOST_PORTS.includes(portId) ? { kind: 'host' } : { kind: 'dead' }
    }
  }

  private accessPointCarriage(device: Device, portId: string, link: Link): EndCarriage {
    if (portId === 'uplink') return { kind: 'all' }
    if (portId !== 'radio') return { kind: 'dead' }
    const network = device.wirelessNetworks?.find((candidate) => candidate.ssid === link.ssid)
    return network ? { kind: 'vlan', vlan: network.vlan } : { kind: 'dead' }
  }
}
