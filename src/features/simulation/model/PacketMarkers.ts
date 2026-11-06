import type { PacketMarker, SimEvent, SimTransmission } from '../simulationServices'
import type { StepWindow } from './SimulationPlayer'

/** A packet on the map: the contract's marker plus the events a click opens. */
export interface MapPacket extends PacketMarker {
  /** The event that sent the frame. */
  readonly sentByEventId: number
  /** The far end's event for this frame, once it has arrived (in this step or before). */
  readonly arrivalEventId: number | null
}

/** Fallback for events without `transmissionId` (hand-made fixtures). */
function arrivalKey(time: number, deviceId: string, portId: string, frameId: string): string {
  return `${time}|${deviceId}|${portId}|${frameId}`
}

/**
 * Where the packets of one step are on the map (docs/SIMULATION.md §8). Virtual time runs from
 * `window.from` to `window.to` while the animation progresses from 0 to 1; a frame is drawn while it
 * is on its link during that span: at the sender before it leaves, moving while it travels, at the
 * receiver once it arrived (red when the receiver dropped it). Frames that arrived before the step are
 * gone. Several packets at once (floods) are normal.
 */
export class PacketMarkers {
  private readonly window: StepWindow | null
  private readonly visible: readonly SimTransmission[]
  private readonly arrivals: ReadonlyMap<string, SimEvent>
  private readonly arrivalsByTransmission: ReadonlyMap<number, SimEvent>

  constructor(transmissions: readonly SimTransmission[], events: readonly SimEvent[], window: StepWindow | null) {
    this.window = window
    this.visible = window
      ? transmissions.filter((transmission) => transmission.departAt <= window.to && transmission.arriveAt > window.from)
      : []
    const arrivals = new Map<string, SimEvent>()
    const byTransmission = new Map<number, SimEvent>()
    if (this.visible.length > 0) {
      for (const event of events) {
        if (event.transmissionId !== undefined) byTransmission.set(event.transmissionId, event)
        else if (event.inPortId !== undefined && event.frameId !== null) {
          arrivals.set(arrivalKey(event.time, event.deviceId, event.inPortId, event.frameId), event)
        }
      }
    }
    this.arrivals = arrivals
    this.arrivalsByTransmission = byTransmission
  }

  get count(): number {
    return this.visible.length
  }

  /** Markers at animation progress 0..1 (clamped). */
  at(progress: number): MapPacket[] {
    const window = this.window
    if (!window) return []
    const clamped = Math.min(1, Math.max(0, progress))
    const now = window.from + (window.to - window.from) * clamped
    return this.visible.map((transmission) => {
      const arrival = this.arrivalOf(transmission)
      return {
        transmissionId: transmission.id,
        linkId: transmission.linkId,
        fromDeviceId: transmission.from.deviceId,
        toDeviceId: transmission.to.deviceId,
        fraction: PacketMarkers.fraction(transmission, now),
        protocol: transmission.protocol,
        flowId: transmission.flowId,
        dropped: arrival?.action === 'dropped',
        sentByEventId: transmission.eventId,
        arrivalEventId: arrival?.id ?? null,
      }
    })
  }

  /** Share of the link behind the frame at virtual time `now` (0 at the sender, 1 at the receiver). */
  static fraction(transmission: SimTransmission, now: number): number {
    const span = transmission.arriveAt - transmission.departAt
    if (span <= 0) return now >= transmission.arriveAt ? 1 : 0
    return Math.min(1, Math.max(0, (now - transmission.departAt) / span))
  }

  private arrivalOf(transmission: SimTransmission): SimEvent | undefined {
    const matched = this.arrivalsByTransmission.get(transmission.id)
    if (matched) return matched
    const { to } = transmission
    return this.arrivals.get(arrivalKey(transmission.arriveAt, to.deviceId, to.portId, transmission.frameId))
  }
}
