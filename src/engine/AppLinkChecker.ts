import type { AppLinkStatus } from '../domain/EngineContract'
import type { AppLink, NetworkState } from '../domain/NetworkTypes'
import { AppLinkVerdict } from './AppLinkVerdict'
import { DeviceLookup } from './DeviceLookup'
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
    const reach = this.reachability.reach(state, deviceId, appLink.targetIp)
    const answering = reach.ok ? DeviceLookup.answeringDevice(state, reach.path, appLink.targetIp) : undefined
    return AppLinkVerdict.of(appLink, reach, answering)
  }
}
