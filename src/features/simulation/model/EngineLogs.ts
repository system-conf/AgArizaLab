import type { SimEvent, SimSnapshot, SimTransmission, SimulationEngine } from '../simulationServices'

/** Events / transmissions kept at most (the kernel's default retention). */
export const MAX_LOGGED = 50_000

/** `current` followed by `added`, newest last; the oldest entries go beyond `MAX_LOGGED`. */
function appended<Entry>(current: readonly Entry[], added: readonly Entry[]): readonly Entry[] {
  if (added.length === 0) return current
  const next = [...current, ...added]
  return next.length > MAX_LOGGED ? next.slice(next.length - MAX_LOGGED) : next
}

/**
 * The player's copy of the engine's append-only logs (docs/SIMULATION.md §5). The engine's own logs
 * cannot take frames that were simulated elsewhere; this copy can: a command run in the Web Worker
 * comes back as a snapshot plus its events and transmissions, which are appended here after the
 * engine restored the snapshot. Immutable arrays, so the UI sees a new list after every change.
 */
export class EngineLogs {
  private eventList: readonly SimEvent[] = []
  private transmissionList: readonly SimTransmission[] = []
  /** Next ids to pull from the engine. */
  private eventCursor: number
  private transmissionCursor: number

  constructor(engine: SimulationEngine) {
    const { counters } = engine.snapshot()
    this.eventCursor = counters.event
    this.transmissionCursor = counters.transmission
  }

  get events(): readonly SimEvent[] {
    return this.eventList
  }

  get transmissions(): readonly SimTransmission[] {
    return this.transmissionList
  }

  /** Takes what the engine logged since the last pull; returns just that part. */
  pull(engine: SimulationEngine): { events: readonly SimEvent[]; transmissions: readonly SimTransmission[] } {
    const events = engine.events(this.eventCursor)
    const transmissions = engine.transmissions(this.transmissionCursor)
    this.add(engine.snapshot(), events, transmissions)
    return { events, transmissions }
  }

  /** Logs simulated elsewhere up to `snapshot` (the engine already restored it). */
  add(snapshot: SimSnapshot, events: readonly SimEvent[], transmissions: readonly SimTransmission[]): void {
    this.eventList = appended(this.eventList, events)
    this.transmissionList = appended(this.transmissionList, transmissions)
    this.eventCursor = snapshot.counters.event
    this.transmissionCursor = snapshot.counters.transmission
  }

  /** The engine went back to `snapshot`: forget what came after it. */
  truncate(snapshot: SimSnapshot): void {
    const { event, transmission } = snapshot.counters
    this.eventList = this.eventList.filter((entry) => entry.id < event)
    this.transmissionList = this.transmissionList.filter((entry) => entry.id < transmission)
    this.eventCursor = event
    this.transmissionCursor = transmission
  }
}
