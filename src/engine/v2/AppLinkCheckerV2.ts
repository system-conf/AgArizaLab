import type { AppLinkStatusV2, AppLinkV2, NetworkStateV2 } from '../../domain/v2'
import { AppLinkVerdict } from '../AppLinkVerdict'
import { DeviceAddressesV2 } from './DeviceAddressesV2'
import type { ReachabilityCheckerV2 } from './ReachabilityCheckerV2'
import { TopologyV2 } from './TopologyV2'

/** Checks a device's application dependencies (printer, cameras, kitchen display…), PLAN §4.4. */
export class AppLinkCheckerV2 {
  private readonly reachability: ReachabilityCheckerV2

  constructor(reachability: ReachabilityCheckerV2) {
    this.reachability = reachability
  }

  status(state: NetworkStateV2, deviceId: string): AppLinkStatusV2[] {
    const device = TopologyV2.of(state).require(deviceId)
    return (device.host?.appLinks ?? []).map((appLink) => this.check(state, deviceId, appLink))
  }

  private check(state: NetworkStateV2, deviceId: string, appLink: AppLinkV2): AppLinkStatusV2 {
    const reach = this.reachability.reach(state, deviceId, appLink.targetIp)
    const answering = reach.ok ? DeviceAddressesV2.answeringDevice(state, reach.path, appLink.targetIp) : undefined
    return AppLinkVerdict.of(appLink, reach, answering)
  }
}
