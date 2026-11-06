import type { Device, NetworkCondition, NetworkEngine, NetworkState } from '../domain'
import { DeviceAddresses, HostAttachment, L3Interfaces, SegmentFinder, Topology } from '../engine'
import { Cidr, type CidrBlock } from './Cidr'
import type { GroupMembers, ResolvedGroup } from './GroupMembers'

/** Progress of a requirement for the checklist ("3 / 5"); for limits value ≤ limit means ok. */
export interface RequirementMeasure {
  unit: 'members' | 'pairs' | 'cost' | 'devices'
  value: number
  limit: number
}

export interface ConditionOutcome {
  ok: boolean
  measure?: RequirementMeasure
}

/** Address the 'internet' requirement pings (same as the troubleshooting exercises). */
const INTERNET_PROBE_IP = '8.8.8.8'

/** Groups a network condition is about (for failure candidates and single points of failure). */
export function conditionGroups(condition: NetworkCondition): string[] {
  switch (condition.type) {
    case 'reachable':
    case 'notReachable':
      return [condition.fromGroup, condition.toGroup]
    case 'separateSubnets':
      return [condition.groupA, condition.groupB]
    case 'internet':
    case 'resolves':
    case 'dhcpServes':
    case 'sameVlan':
    case 'addressPlan':
      return [condition.group]
  }
}

/**
 * Evaluates network conditions (DESIGN_EXERCISES.md §2) on a state through the engine. The state is
 * expected to be settled (DhcpSettler) already; nothing is mutated. A missing member always fails.
 */
export class NetworkConditionEvaluator {
  private readonly engine: NetworkEngine
  private readonly groups: GroupMembers
  private readonly segments = new SegmentFinder()

  constructor(engine: NetworkEngine, groups: GroupMembers) {
    this.engine = engine
    this.groups = groups
  }

  evaluate(state: NetworkState, condition: NetworkCondition): ConditionOutcome {
    switch (condition.type) {
      case 'reachable':
        return this.reachable(state, condition.fromGroup, condition.toGroup)
      case 'notReachable':
        return this.notReachable(state, condition.fromGroup, condition.toGroup)
      case 'internet':
        return this.everyMember(state, condition.group, (device) => this.engine.reach(state, device.id, INTERNET_PROBE_IP).ok)
      case 'resolves':
        return this.everyMember(state, condition.group, (device) => this.engine.resolve(state, device.id, condition.name).ok)
      case 'dhcpServes':
        return this.everyMember(state, condition.group, (device) => this.servedByDhcp(state, device))
      case 'separateSubnets':
        return this.separateSubnets(state, condition.groupA, condition.groupB)
      case 'sameVlan':
        return this.sameVlan(state, condition.group)
      case 'addressPlan':
        return this.addressPlan(state, condition.group, condition.prefix)
    }
  }

  private everyMember(state: NetworkState, groupId: string, holds: (device: Device) => boolean): ConditionOutcome {
    const members = this.groups.resolve(state, groupId)
    const done = members.devices.filter(holds).length
    const total = members.devices.length + members.missing.length
    return { ok: done === total, measure: { unit: 'members', value: done, limit: total } }
  }

  private reachable(state: NetworkState, fromGroup: string, toGroup: string): ConditionOutcome {
    const from = this.groups.resolve(state, fromGroup)
    const to = this.groups.resolve(state, toGroup)
    let total = 0
    let done = 0
    for (const source of from.devices) {
      for (const target of to.devices) {
        if (source.id === target.id) continue
        total += 1
        if (this.reaches(state, source, target)) done += 1
      }
    }
    const complete = from.missing.length === 0 && to.missing.length === 0
    return { ok: complete && done === total, measure: { unit: 'pairs', value: done, limit: total } }
  }

  private notReachable(state: NetworkState, fromGroup: string, toGroup: string): ConditionOutcome {
    const from = this.groups.resolve(state, fromGroup)
    const to = this.groups.resolve(state, toGroup)
    const inService = [from, to].every((members) => members.missing.length === 0 && members.devices.every((device) => this.inService(state, device, members)))
    let total = 0
    let isolated = 0
    for (const source of from.devices) {
      for (const target of to.devices) {
        if (source.id === target.id) continue
        total += 1
        if (!this.reaches(state, source, target)) isolated += 1
      }
    }
    return { ok: inService && isolated === total, measure: { unit: 'pairs', value: inService ? isolated : 0, limit: total } }
  }

  /** Has an address and reaches its default gateway or another member of its own group. */
  private inService(state: NetworkState, device: Device, own: ResolvedGroup): boolean {
    if (DeviceAddresses.of(device).length === 0) return false
    const gateway = device.host?.defaultGateway ?? ''
    if (gateway !== '' && this.engine.reach(state, device.id, gateway).ok) return true
    return own.devices.some((other) => other.id !== device.id && this.reaches(state, device, other))
  }

  private reaches(state: NetworkState, source: Device, target: Device): boolean {
    const targetIp = DeviceAddresses.of(target)[0]
    return targetIp !== undefined && this.engine.reach(state, source.id, targetIp).ok
  }

  private servedByDhcp(state: NetworkState, device: Device): boolean {
    if (!L3Interfaces.nics(device).some((nic) => nic.addressing === 'dhcp')) return false
    return this.engine.renewDhcp(state, device.id).ok
  }

  private separateSubnets(state: NetworkState, groupA: string, groupB: string): ConditionOutcome {
    const subnetsA = this.subnetsOf(state, groupA)
    const subnetsB = this.subnetsOf(state, groupB)
    if (subnetsA === null || subnetsB === null) return { ok: false }
    return { ok: subnetsA.every((a) => subnetsB.every((b) => !Cidr.overlaps(a, b))) }
  }

  /** Connected subnets of every member's addressed NICs; null when a member is missing or unaddressed. */
  private subnetsOf(state: NetworkState, groupId: string): CidrBlock[] | null {
    const members = this.groups.resolve(state, groupId)
    if (members.missing.length > 0) return null
    const blocks: CidrBlock[] = []
    for (const device of members.devices) {
      const nics = L3Interfaces.of(device).filter((iface) => L3Interfaces.isAddressed(iface))
      if (nics.length === 0) return null
      for (const nic of nics) {
        const block = Cidr.ofInterface(nic.address, nic.mask)
        if (block) blocks.push(block)
      }
    }
    return blocks
  }

  private sameVlan(state: NetworkState, groupId: string): ConditionOutcome {
    const members = this.groups.resolve(state, groupId)
    const total = members.devices.length + members.missing.length
    const [first] = members.devices
    if (!first) return { ok: false, measure: { unit: 'members', value: 0, limit: total } }
    const topology = Topology.of(state)
    const start = HostAttachment.activeNics(topology, first)[0] ?? L3Interfaces.of(first)[0]
    if (!start) return { ok: false, measure: { unit: 'members', value: 0, limit: total } }
    const inSegment = new Set(this.segments.segment(state, start).members.map((iface) => iface.deviceId))
    const together = members.devices.filter((device) => inSegment.has(device.id)).length
    return { ok: together === total, measure: { unit: 'members', value: together, limit: total } }
  }

  private addressPlan(state: NetworkState, groupId: string, prefix: string): ConditionOutcome {
    const block = Cidr.parse(prefix)
    return this.everyMember(state, groupId, (device) => {
      const addresses = DeviceAddresses.of(device)
      return block !== null && addresses.length > 0 && addresses.every((address) => Cidr.contains(block, address))
    })
  }
}
