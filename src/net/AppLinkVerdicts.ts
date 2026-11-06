import type { AppLink, AppLinkStatus, Device, ReachResult } from '../domain'
import { Ipv4 } from './Ipv4'

/** The lab rule for an application dependency, shared by the rule engine and the simulator (PLAN §4.4). */
export class AppLinkVerdicts {
  /**
   * A reachable target only counts when the device answering there is powered and of the expected
   * kind; an internet target counts when its public address is reached.
   */
  static of(appLink: AppLink, reach: ReachResult, answering: Device | undefined): AppLinkStatus {
    const base = { appLinkId: appLink.id, label: appLink.label, targetIp: appLink.targetIp }
    if (!reach.ok) return { ...base, ok: false, reason: reach.reason }
    const isInternetTarget = appLink.targetKind === 'internet' && !answering && Ipv4.isPublic(appLink.targetIp)
    if (isInternetTarget || (answering && answering.powered && answering.kind === appLink.targetKind)) return { ...base, ok: true }
    return { ...base, ok: false, reason: 'wrongDeviceAtAddress' }
  }
}
