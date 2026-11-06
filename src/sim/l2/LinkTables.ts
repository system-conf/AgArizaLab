import {
  type AddressClaim,
  type ArpEntry,
  type DeviceContext,
  type LinkRuntime,
  type MacTableEntry,
  type PendingPacket,
  type SeenFrame,
  SIM_TIMING,
} from '../contract'
import { RuntimeTables } from '../core/RuntimeTables'

/** Result of learning a source MAC: new / moved to another port, or only refreshed. */
export type MacLearning = 'learned' | 'refreshed' | 'static'

/**
 * Reads and writes of the link-layer runtime slice (docs/SIMULATION.md §4). Every write prunes aged
 * entries (lazy aging) and goes through `ctx.updateRuntime`, so a write never works on a stale copy
 * even when the network layer re-enters the link layer in between.
 */
export class LinkTables {
  static update(ctx: DeviceContext, change: (link: LinkRuntime) => LinkRuntime): void {
    ctx.updateRuntime((runtime) => ({ ...runtime, link: change(runtime.link) }))
  }

  // ------------------------------------------------------------ MAC table

  static macLookup(ctx: DeviceContext, vlan: number, mac: string): MacTableEntry | undefined {
    const { now } = ctx
    for (const entry of ctx.runtime.link.macTable) {
      if (entry.vlan === vlan && entry.mac === mac && RuntimeTables.isLive(entry, now)) return entry
    }
    return undefined
  }

  /** One pass over the table (a core switch knows every MAC of the lab, and learns on every frame). */
  static learnMac(ctx: DeviceContext, vlan: number, mac: string, portId: string): MacLearning {
    const known = LinkTables.macLookup(ctx, vlan, mac)
    if (known?.type === 'static') return 'static'
    const outcome: MacLearning = known?.portId === portId ? 'refreshed' : 'learned'
    const { now } = ctx
    const entry: MacTableEntry = { vlan, mac, portId, type: 'dynamic', learnedAt: now, expiresAt: now + SIM_TIMING.macAgeMs }
    LinkTables.update(ctx, (link) => {
      const macTable: MacTableEntry[] = []
      for (const old of link.macTable) {
        if (RuntimeTables.isLive(old, now) && (old.vlan !== vlan || old.mac !== mac)) macTable.push(old)
      }
      macTable.push(entry)
      return { ...link, macTable }
    })
    return outcome
  }

  /** Removes the dynamic MAC entries that match; returns how many live ones went. */
  static forgetMac(ctx: DeviceContext, matches: (entry: MacTableEntry) => boolean): number {
    const live = LinkTables.liveMac(ctx.runtime.link, ctx.now)
    const kept = live.filter((entry) => entry.type === 'static' || !matches(entry))
    LinkTables.update(ctx, (link) => ({ ...link, macTable: kept }))
    return live.length - kept.length
  }

  // ------------------------------------------------------------ ARP cache

  static arpLookup(ctx: DeviceContext, interfaceId: string, ip: string): ArpEntry | undefined {
    return RuntimeTables.arp(ctx.runtime, ctx.now).find((entry) => entry.interfaceId === interfaceId && entry.ip === ip)
  }

  static putArp(ctx: DeviceContext, entry: ArpEntry): void {
    LinkTables.update(ctx, (link) => ({
      ...link,
      arp: [...LinkTables.otherArp(link, ctx.now, entry.interfaceId, entry.ip), entry],
    }))
  }

  static removeArp(ctx: DeviceContext, interfaceId: string, ip: string): void {
    LinkTables.update(ctx, (link) => ({ ...link, arp: LinkTables.otherArp(link, ctx.now, interfaceId, ip) }))
  }

  /** Removes the dynamic ARP entries that match; returns how many live ones went. */
  static forgetArp(ctx: DeviceContext, matches: (entry: ArpEntry) => boolean): number {
    const live = RuntimeTables.arp(ctx.runtime, ctx.now)
    const kept = live.filter((entry) => entry.type === 'static' || !matches(entry))
    LinkTables.update(ctx, (link) => ({ ...link, arp: kept }))
    return live.length - kept.length
  }

  // ------------------------------------------------------------ packets waiting for ARP

  static addPending(ctx: DeviceContext, packet: PendingPacket): void {
    LinkTables.update(ctx, (link) => ({ ...link, pending: [...link.pending, packet] }))
  }

  /** Takes the waiting packets that match out of the runtime (in queue order). */
  static takePending(ctx: DeviceContext, matches: (packet: PendingPacket) => boolean): PendingPacket[] {
    const taken = ctx.runtime.link.pending.filter(matches)
    if (taken.length > 0) LinkTables.update(ctx, (link) => ({ ...link, pending: link.pending.filter((packet) => !matches(packet)) }))
    return taken
  }

  // ------------------------------------------------------------ duplicate address claims

  static claim(ctx: DeviceContext, interfaceId: string): AddressClaim | undefined {
    return ctx.runtime.link.claims.find((claim) => claim.interfaceId === interfaceId)
  }

  static putClaim(ctx: DeviceContext, claim: AddressClaim): void {
    LinkTables.update(ctx, (link) => ({
      ...link,
      claims: [...link.claims.filter((old) => old.interfaceId !== claim.interfaceId), claim],
    }))
  }

  static removeClaim(ctx: DeviceContext, interfaceId: string): void {
    LinkTables.update(ctx, (link) => ({ ...link, claims: link.claims.filter((old) => old.interfaceId !== interfaceId) }))
  }

  // ------------------------------------------------------------ loop guard

  /** True when the frame id passed this device in the last SIM_TIMING.seenFrameMs; records it otherwise. */
  static seenBefore(ctx: DeviceContext, frameId: string): boolean {
    const since = ctx.now - SIM_TIMING.seenFrameMs
    const recent: SeenFrame[] = []
    for (const seen of ctx.runtime.link.seenFrames) {
      if (seen.at <= since) continue
      if (seen.frameId === frameId) return true
      recent.push(seen)
    }
    recent.push({ frameId, at: ctx.now })
    LinkTables.update(ctx, (link) => ({ ...link, seenFrames: recent }))
    return false
  }

  /** Records a frame this device sends itself (a looped copy of it is then caught too). */
  static remember(ctx: DeviceContext, frameId: string): void {
    LinkTables.seenBefore(ctx, frameId)
  }

  // ------------------------------------------------------------ internals

  private static liveMac(link: LinkRuntime, now: number): MacTableEntry[] {
    return link.macTable.filter((entry) => RuntimeTables.isLive(entry, now))
  }

  private static otherArp(link: LinkRuntime, now: number, interfaceId: string, ip: string): ArpEntry[] {
    return link.arp.filter((old) => RuntimeTables.isLive(old, now) && (old.interfaceId !== interfaceId || old.ip !== ip))
  }
}
