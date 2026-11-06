import type { AppLink, AppLinkStatus, Device, NetworkState, ReachResult } from '../domain'
import { DeviceAddresses } from './DeviceAddresses'
import { Ipv4 } from './Ipv4'
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
    return AppLinkChecker.verdict(appLink, reach, answering)
  }

  /**
   * A reachable target only counts when the device answering there is powered and of the expected
   * kind; an internet target counts when its public address is reached.
   */
  private static verdict(appLink: AppLink, reach: ReachResult, answering: Device | undefined): AppLinkStatus {
    const base = { appLinkId: appLink.id, label: appLink.label, targetIp: appLink.targetIp }
    if (!reach.ok) return { ...base, ok: false, reason: reach.reason }
    const isInternetTarget = appLink.targetKind === 'internet' && !answering && Ipv4.isPublic(appLink.targetIp)
    if (isInternetTarget || (answering && answering.powered && answering.kind === appLink.targetKind)) return { ...base, ok: true }
    return { ...base, ok: false, reason: 'wrongDeviceAtAddress' }
  }
}
