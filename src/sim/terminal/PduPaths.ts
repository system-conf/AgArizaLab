import type { PacketTrace } from '../../domain'
import type { SimEvent, SimTransmission } from '../contract'

/** Events that only show a flooded copy reaching the wrong place: never the end of a packet's journey. */
function isSideBranch(event: SimEvent): boolean {
  return event.action === 'filtered' || (event.action === 'dropped' && event.reason === 'notForThisInterface')
}

/**
 * The devices a packet passed (docs/SIMULATION.md §10.1 `PacketTrace.path`), rebuilt backwards from the
 * event that ended it: an arrival event names its transmission, the transmission names the event that sent
 * it, a released buffered packet points to the event that buffered it. Flood copies are side branches.
 */
export class PduPaths {
  private readonly events: ReadonlyMap<number, SimEvent>
  private readonly transmissions: ReadonlyMap<number, SimTransmission>

  constructor(events: readonly SimEvent[], transmissions: readonly SimTransmission[]) {
    this.events = new Map(events.map((event) => [event.id, event]))
    this.transmissions = new Map(transmissions.map((transmission) => [transmission.id, transmission]))
  }

  /** The trace of one PDU: to its consumer when `ok`, else to the device that ended it ([source] when none). */
  trace(pduId: string | null, sourceId: string, ok: boolean): PacketTrace {
    const end = pduId === null ? undefined : this.endOf(pduId)
    const path = end ? this.pathTo(end) : []
    return { path: path.length > 0 ? path : [sourceId], ok }
  }

  /** Source first, consecutive repeats of a device (buffered, then sent) collapsed. */
  pathTo(end: SimEvent): string[] {
    const devices: string[] = []
    const seen = new Set<number>()
    for (let current: SimEvent | undefined = end; current && !seen.has(current.id); current = this.previous(current)) {
      seen.add(current.id)
      if (devices[devices.length - 1] !== current.deviceId) devices.push(current.deviceId)
    }
    return devices.reverse()
  }

  /** The consuming event (delivered / replied), else the furthest end of the packet's main branch. */
  private endOf(pduId: string): SimEvent | undefined {
    const own = [...this.events.values()].filter((event) => event.pduId === pduId)
    const consumed = own.find((event) => event.action === 'replied' || event.action === 'delivered')
    if (consumed) return consumed
    let best: { event: SimEvent; length: number } | undefined
    for (const event of own) {
      if (isSideBranch(event)) continue
      const length = this.pathTo(event).length
      if (!best || length >= best.length) best = { event, length }
    }
    return best?.event
  }

  private previous(event: SimEvent): SimEvent | undefined {
    if (event.transmissionId !== undefined) {
      const transmission = this.transmissions.get(event.transmissionId)
      return transmission ? this.events.get(transmission.eventId) : undefined
    }
    if (event.causeEventId === undefined) return undefined
    const cause = this.events.get(event.causeEventId)
    return cause && cause.deviceId === event.deviceId && cause.pduId === event.pduId ? cause : undefined
  }
}
