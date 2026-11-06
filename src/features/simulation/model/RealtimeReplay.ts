import type { SimEvent, SimTransmission } from '../simulationServices'

/** Wall time of one replayed hop (the old ping animation's pace). */
export const REPLAY_HOP_MS = 350
/** Virtual idle time that ends the replay (the next echo starts 1000 ms after a reply). */
export const REPLAY_GAP_MS = 500
/** Hops replayed at most, so a long run never animates for minutes. */
export const MAX_REPLAY_HOPS = 40

/** One hop of the replay: the virtual time span the map animates in `REPLAY_HOP_MS`. */
export interface ReplayHop {
  readonly from: number
  readonly to: number
}

/**
 * Realtime mode's map animation (docs/SIMULATION.md §5.5, §8): a terminal command runs to the end at
 * once; afterwards its frames are replayed on the map, hop by hop, like a simulation step each. Only
 * the first burst of traffic is replayed (up to the first idle gap of `REPLAY_GAP_MS` virtual ms):
 * the ARP exchange and the first echo with its answer or the place it was dropped. Immutable.
 */
export class RealtimeReplay {
  readonly hops: readonly ReplayHop[]
  readonly transmissions: readonly SimTransmission[]
  readonly events: readonly SimEvent[]

  private constructor(hops: readonly ReplayHop[], transmissions: readonly SimTransmission[], events: readonly SimEvent[]) {
    this.hops = hops
    this.transmissions = transmissions
    this.events = events
  }

  /** The replay of one run's log; null when no frame went on the wire. */
  static of(transmissions: readonly SimTransmission[], events: readonly SimEvent[]): RealtimeReplay | null {
    const times = RealtimeReplay.firstBurst(transmissions)
    if (times.length < 2) return null
    const hops: ReplayHop[] = []
    for (let index = 1; index < times.length && hops.length < MAX_REPLAY_HOPS; index += 1) {
      const from = times[index - 1]
      const to = times[index]
      if (from !== undefined && to !== undefined) hops.push({ from, to })
    }
    const last = hops[hops.length - 1]
    const end = last?.to ?? 0
    const shown = transmissions.filter((transmission) => transmission.departAt < end)
    const shownEvents = events.filter((event) => event.time <= end)
    return new RealtimeReplay(hops, shown, shownEvents)
  }

  /** Sorted distinct departure and arrival times up to the first idle gap. */
  private static firstBurst(transmissions: readonly SimTransmission[]): number[] {
    const all = new Set<number>()
    for (const transmission of transmissions) {
      all.add(transmission.departAt)
      all.add(transmission.arriveAt)
    }
    const sorted = [...all].sort((a, b) => a - b)
    const burst: number[] = []
    for (const time of sorted) {
      const previous = burst[burst.length - 1]
      if (previous !== undefined && time - previous > REPLAY_GAP_MS) break
      burst.push(time)
    }
    return burst
  }
}
