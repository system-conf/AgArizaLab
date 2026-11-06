import { type ArpEntry, type DeviceRuntime, type DnsCacheEntry, type MacTableEntry, SIM_PORTS } from '../contract'

/**
 * Runtime slices: the empty runtime of a starting device, and the live (not yet aged-out) table
 * entries the CLI and the layers read. Aging is lazy: an entry whose `expiresAt` is not after `now`
 * no longer exists, whether or not a layer has pruned it yet.
 */
export class RuntimeTables {
  static empty(deviceId: string): DeviceRuntime {
    return {
      deviceId,
      link: { arp: [], macTable: [], pending: [], claims: [], seenFrames: [] },
      network: { routes: [], sessions: [], ipIdentification: 1, echoIdentifier: 1 },
      services: { dhcpBindings: [], dhcpClients: [], dnsCache: [], sessions: [], nextEphemeralPort: SIM_PORTS.ephemeralStart },
    }
  }

  static isLive(entry: { readonly expiresAt: number | null }, now: number): boolean {
    return entry.expiresAt === null || entry.expiresAt > now
  }

  static arp(runtime: DeviceRuntime, now: number): ArpEntry[] {
    return runtime.link.arp.filter((entry) => RuntimeTables.isLive(entry, now))
  }

  static macTable(runtime: DeviceRuntime, now: number): MacTableEntry[] {
    return runtime.link.macTable.filter((entry) => RuntimeTables.isLive(entry, now))
  }

  static dnsCache(runtime: DeviceRuntime, now: number): DnsCacheEntry[] {
    return runtime.services.dnsCache.filter((entry) => RuntimeTables.isLive(entry, now))
  }
}
