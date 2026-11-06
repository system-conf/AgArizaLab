import type { AppLink, AppLinkStatus, NetworkState } from '../domain'
import { AppLinkVerdicts } from '../net/AppLinkVerdicts'
import { DeviceAddresses } from './DeviceAddresses'
import type { ReachabilityChecker } from './ReachabilityChecker'
import { Topology } from './Topology'

/** Checks a device's application dependencies (printer, cameras, kitchen display…), PLAN §4.4. */
export class AppLinkChecker {
  private readonly reachability: ReachabilityChecker

  constructor(reachability: ReachabilityChecker) {
    this.reachability = reachability
  }

  status(state: NetworkState, deviceId: string): AppLinkStatus[] {
    const device = Topology.of(state).require(deviceId)
    return (device.host?.appLinks ?? []).map((appLink) => this.check(state, deviceId, appLink))
  }

  private check(state: NetworkState, deviceId: string, appLink: AppLink): AppLinkStatus {
    const reach = this.reachability.reach(state, deviceId, appLink.targetIp)
    const answering = reach.ok ? DeviceAddresses.answeringDevice(state, reach.path, appLink.targetIp) : undefined
    return AppLinkVerdicts.of(appLink, reach, answering)
  }
}
