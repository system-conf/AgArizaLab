import type { FailureTarget, NetworkState } from '../domain'

/** The network with one element down; `failedId` is the device or link id that failed. */
export interface FailureCase {
  failedId: string
  scope: 'device' | 'link'
  state: NetworkState
}

/**
 * Builds the failure cases of a `survivesFailure` target on a copy of a state: a device fails by
 * losing power, a link by being unplugged. `memberIds` are the devices the requirement is about;
 * with `anyDevice` / `anyLink` the members, their directly linked devices and their own links are
 * not tried (a single-homed end device always depends on them).
 */
export class FailureScenarios {
  cases(state: NetworkState, target: FailureTarget, memberIds: ReadonlySet<string>): FailureCase[] {
    switch (target.scope) {
      case 'device':
        return state.devices.some((device) => device.id === target.deviceId) ? [this.deviceDown(state, target.deviceId)] : []
      case 'link':
        return state.links.some((link) => link.id === target.linkId) ? [this.linkDown(state, target.linkId)] : []
      case 'anyDevice': {
        const neighbours = this.neighboursOf(state, memberIds)
        return state.devices
          .filter((device) => target.kinds.includes(device.kind) && device.powered && !memberIds.has(device.id) && !neighbours.has(device.id))
          .map((device) => this.deviceDown(state, device.id))
      }
      case 'anyLink':
        return state.links
          .filter((link) => link.connected && !memberIds.has(link.a.deviceId) && !memberIds.has(link.b.deviceId))
          .map((link) => this.linkDown(state, link.id))
    }
  }

  deviceDown(state: NetworkState, deviceId: string): FailureCase {
    const devices = state.devices.map((device) => (device.id === deviceId ? { ...device, powered: false } : device))
    return { failedId: deviceId, scope: 'device', state: { ...state, devices } }
  }

  linkDown(state: NetworkState, linkId: string): FailureCase {
    const links = state.links.map((link) => (link.id === linkId ? { ...link, connected: false } : link))
    return { failedId: linkId, scope: 'link', state: { ...state, links } }
  }

  /** Devices with a link (plugged or not) to one of `memberIds`. */
  neighboursOf(state: NetworkState, memberIds: ReadonlySet<string>): Set<string> {
    const neighbours = new Set<string>()
    for (const link of state.links) {
      if (memberIds.has(link.a.deviceId)) neighbours.add(link.b.deviceId)
      if (memberIds.has(link.b.deviceId)) neighbours.add(link.a.deviceId)
    }
    return neighbours
  }
}
