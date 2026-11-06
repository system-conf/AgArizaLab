import type { Device, DeviceGroup, NetworkState } from '../domain'

/** The members of one group in one state; `missing` = member ids no longer in the lab. */
export interface ResolvedGroup {
  group: DeviceGroup
  devices: Device[]
  missing: string[]
}

/** Resolves brief groups against a state. Unknown group ids are programmer errors (the validator catches them). */
export class GroupMembers {
  private readonly groups: ReadonlyMap<string, DeviceGroup>

  constructor(groups: readonly DeviceGroup[]) {
    this.groups = new Map(groups.map((group) => [group.id, group]))
  }

  group(groupId: string): DeviceGroup {
    const group = this.groups.get(groupId)
    if (!group) throw new Error(`Unknown design group: ${groupId}`)
    return group
  }

  resolve(state: NetworkState, groupId: string): ResolvedGroup {
    const group = this.group(groupId)
    const byId = new Map(state.devices.map((device) => [device.id, device]))
    const devices: Device[] = []
    const missing: string[] = []
    for (const deviceId of group.deviceIds) {
      const device = byId.get(deviceId)
      if (device) devices.push(device)
      else missing.push(deviceId)
    }
    return { group, devices, missing }
  }

  /** Ids of every member of the given groups. */
  memberIds(groupIds: readonly string[]): Set<string> {
    return new Set(groupIds.flatMap((groupId) => this.group(groupId).deviceIds))
  }

  /** Ids of every member of every group. */
  allMemberIds(): Set<string> {
    return this.memberIds([...this.groups.keys()])
  }
}
