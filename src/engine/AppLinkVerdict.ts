import { Ipv4 } from './Ipv4'

/** The parts of an AppLink the verdict needs (v1 and v2 shapes). */
interface AppLinkTarget {
  id: string
  label: string
  targetIp: string
  targetKind: string
}

/** The device at the end of the path that owns the target address. */
interface AnsweringDevice {
  powered: boolean
  kind: string
}

/** Reach result of either model; `Reason` is its failure reason type. */
type Reach<Reason> = { ok: true } | { ok: false; reason: Reason }

export interface AppLinkVerdictResult<Reason> {
  appLinkId: string
  label: string
  targetIp: string
  ok: boolean
  reason?: Reason | 'wrongDeviceAtAddress'
}

/** Turns a reach result into an AppLink status (PLAN §4.4); shared by the v1 and v2 checkers. */
export class AppLinkVerdict {
  static of<Reason>(appLink: AppLinkTarget, reach: Reach<Reason>, answering: AnsweringDevice | undefined): AppLinkVerdictResult<Reason> {
    const base = { appLinkId: appLink.id, label: appLink.label, targetIp: appLink.targetIp }
    if (!reach.ok) return { ...base, ok: false, reason: reach.reason }
    const isInternetTarget = appLink.targetKind === 'internet' && !answering && Ipv4.isPublic(appLink.targetIp)
    if (isInternetTarget || (answering && answering.powered && answering.kind === appLink.targetKind)) return { ...base, ok: true }
    return { ...base, ok: false, reason: 'wrongDeviceAtAddress' }
  }
}
