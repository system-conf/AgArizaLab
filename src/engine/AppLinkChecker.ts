import type { AppLinkStatus } from '../domain/EngineContract'
import type { AppLink, NetworkState } from '../domain/NetworkTypes'
import { DeviceLookup } from './DeviceLookup'
import { Ipv4 } from './Ipv4'
import type { ReachabilityChecker } from './ReachabilityChecker'

/** Checks a device's application dependencies (printer, cameras, kitchen display…), PLAN §4.4. */
export class AppLinkChecker {
  private readonly reachability: ReachabilityChecker

  constructor(reachability: ReachabilityChecker) {
    this.reachability = reachability
  }

  status(state: NetworkState, deviceId: string): AppLinkStatus[] {
    const device = DeviceLookup.require(state, deviceId)
    return (device.appLinks ?? []).map((appLink) => this.check(state, deviceId, appLink))
  }

  private check(state: NetworkState, deviceId: string, appLink: AppLink): AppLinkStatus {
    const base = { appLinkId: appLink.id, label: appLink.label, targetIp: appLink.targetIp }
    const reach = this.reachability.reach(state, deviceId, appLink.targetIp)
    if (!reach.ok) return { ...base, ok: false, reason: reach.reason }

    const target = DeviceLookup.answeringDevice(state, reach.path, appLink.targetIp)
    const isInternetTarget =
      appLink.targetKind === 'internet' && !target && Ipv4.isPublic(appLink.targetIp)
    if (isInternetTarget || (target && target.powered && target.kind === appLink.targetKind)) {
      return { ...base, ok: true }
    }
    return { ...base, ok: false, reason: 'wrongDeviceAtAddress' }
  }
}
