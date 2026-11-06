import type { Device, NetworkState } from '../../domain'
import { Topology } from '../../net/Topology'
import type { DeviceChange } from '../contract'

/** What a new configuration means for the running devices (docs/SIMULATION.md §5.3). */
export interface ChangePlan {
  /** Added or powered on: fresh runtime, onStart. In the new state's device order. */
  readonly started: readonly string[]
  /** Removed or powered off: runtime discarded, their requests aborted. */
  readonly stopped: readonly { readonly deviceId: string; readonly removed: boolean }[]
  /** Running before and after, with a configuration or link-status change: onChange. */
  readonly changed: readonly { readonly deviceId: string; readonly change: DeviceChange }[]
}

export class DeviceChanges {
  static between(previous: NetworkState, next: NetworkState): ChangePlan {
    const before = Topology.of(previous)
    const after = Topology.of(next)
    const stopped: { deviceId: string; removed: boolean }[] = []
    for (const device of previous.devices) {
      if (!device.powered) continue
      const now = after.find(device.id)
      if (!now?.powered) stopped.push({ deviceId: device.id, removed: now === undefined })
    }

    const started: string[] = []
    const changed: { deviceId: string; change: DeviceChange }[] = []
    for (const device of next.devices) {
      if (!device.powered) continue
      const old = before.find(device.id)
      if (!old?.powered) {
        started.push(device.id)
        continue
      }
      const change = DeviceChanges.compare(before, after, old, device)
      if (change) changed.push({ deviceId: device.id, change })
    }
    return { started, stopped, changed }
  }

  private static compare(before: Topology, after: Topology, old: Device, device: Device): DeviceChange | null {
    const configChanged = old !== device && JSON.stringify(old) !== JSON.stringify(device)
    const upBefore = DeviceChanges.portsUp(before, old)
    const upAfter = DeviceChanges.portsUp(after, device)
    const portsDown = [...upBefore].filter((portId) => !upAfter.has(portId))
    const portsUp = [...upAfter].filter((portId) => !upBefore.has(portId))
    if (!configChanged && portsDown.length === 0 && portsUp.length === 0) return null
    return { previous: old, configChanged, portsDown, portsUp }
  }

  /** Ports with at least one link that carries traffic, in port order. */
  private static portsUp(topology: Topology, device: Device): Set<string> {
    const up = new Set<string>()
    for (const port of device.ports) {
      if (topology.linksAt(device.id, port.id).some((link) => topology.isUp(link))) up.add(port.id)
    }
    return up
  }
}
