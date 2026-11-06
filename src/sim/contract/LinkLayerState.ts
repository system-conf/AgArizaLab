// Runtime state and timers of the link layer (S1, docs/SIMULATION.md §4).
// Owner-extensible: S1 may ADD optional fields and timer members here during wave 3.1. The fields
// marked "CLI" are read by Phase 4 (`show mac address-table`, `show ip arp`, `arp -a`): frozen.
import type { Ipv4Packet } from './Pdu'
import type { PduIds } from './SimEvent'

/** ARP cache entry. CLI. */
export interface ArpEntry {
  /** L3 interface the neighbour is on: port id, sub-interface id or 'Vlan<n>' (cloud: port id). */
  readonly interfaceId: string
  readonly ip: string
  /** null while `incomplete`. */
  readonly mac: string | null
  readonly state: 'incomplete' | 'reachable'
  /** 'static' = configured (`arp` command, Phase 4); never ages. */
  readonly type: 'dynamic' | 'static'
  /** Virtual ms of the last update (IOS "Age (min)" = floor((now - updatedAt) / 60000)). */
  readonly updatedAt: number
  /** Virtual ms after which the entry is gone (lazy aging); null = never. */
  readonly expiresAt: number | null
  /** ARP requests sent while incomplete (1..SIM_TIMING.arpAttempts). */
  readonly attempts: number
}

/** Switch MAC address table entry (also access points and wireless routers). CLI. */
export interface MacTableEntry {
  readonly vlan: number
  readonly mac: string
  readonly portId: string
  readonly type: 'dynamic' | 'static'
  readonly learnedAt: number
  /** Lazy aging like ArpEntry; null = never (static). */
  readonly expiresAt: number | null
}

/** An IPv4 packet waiting for ARP to resolve its next hop. */
export interface PendingPacket {
  readonly interfaceId: string
  readonly nextHopIp: string
  readonly packet: Ipv4Packet
  readonly ids: PduIds
  /** Event that buffered it (the later 'sent' / 'dropped' event points back to it). */
  readonly bufferedEventId: number
  readonly queuedAt: number
  /** Copied from LinkSend (forwarded packets). */
  readonly ingressInterfaceId?: string
}

/**
 * Duplicate address detection state of an addressed NIC / SVI (RFC 5227 probe when the address is set,
 * the link comes up or the device starts). Lab rule (engine parity): both NICs that share an address
 * give it up; router-side interfaces defend theirs and never give up.
 */
export interface AddressClaim {
  readonly interfaceId: string
  readonly address: string
  readonly duplicate: boolean
  readonly probedAt: number
}

/** A frame instance a bridge has already forwarded (L2 loop guard until STP, pack 5.1). */
export interface SeenFrame {
  readonly frameId: string
  readonly at: number
}

export interface LinkRuntime {
  /** CLI */
  readonly arp: readonly ArpEntry[]
  /** CLI */
  readonly macTable: readonly MacTableEntry[]
  readonly pending: readonly PendingPacket[]
  readonly claims: readonly AddressClaim[]
  readonly seenFrames: readonly SeenFrame[]
}

/** Timers of the link layer. Stale timers (nothing left to do) are ignored, never cancelled. */
export type LinkTimer = { readonly layer: 'link'; readonly kind: 'arpRetry'; readonly interfaceId: string; readonly ip: string }
