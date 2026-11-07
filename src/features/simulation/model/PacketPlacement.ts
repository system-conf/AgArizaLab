import type { CanvasPoint, LabLayout } from '../../../domain'
import type { MapPacket } from './PacketMarkers'

/** Packets keep this far from device centres so the device icons stay visible. */
export const ICON_CLEARANCE = 30

/** Where a packet is drawn at one moment of the animation. */
export interface PacketPlace {
  readonly x: number
  readonly y: number
  /** The receiver dropped the frame and it has arrived there: drawn as a red ✕. */
  readonly droppedHere: boolean
}

/** Point `fraction` of the way along the visible part of the cable (outside both icons). */
export function along(from: CanvasPoint, to: CanvasPoint, fraction: number): CanvasPoint {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  if (length <= ICON_CLEARANCE * 2) return { x: from.x + dx * fraction, y: from.y + dy * fraction }
  const distance = ICON_CLEARANCE + (length - ICON_CLEARANCE * 2) * fraction
  return { x: from.x + (dx / length) * distance, y: from.y + (dy / length) * distance }
}

/**
 * Canvas positions of packets (docs/SIMULATION.md §8): centre of a device node from the lab layout,
 * a packet's point along its cable. Pure, so the map layer's animation frames only write the results
 * to the DOM.
 */
export class PacketPlacement {
  private readonly layout: LabLayout
  private readonly nodeSize: number

  constructor(layout: LabLayout, nodeSize: number) {
    this.layout = layout
    this.nodeSize = nodeSize
  }

  centreOf(deviceId: string): CanvasPoint {
    const topLeft = this.layout.devices[deviceId] ?? { x: 0, y: 0 }
    return { x: topLeft.x + this.nodeSize / 2, y: topLeft.y + this.nodeSize / 2 }
  }

  place(packet: MapPacket): PacketPlace {
    const point = along(this.centreOf(packet.fromDeviceId), this.centreOf(packet.toDeviceId), packet.fraction)
    return { x: point.x, y: point.y, droppedHere: packet.dropped && packet.fraction >= 1 }
  }

  /** CSS transform that centres a packet element on its place. */
  static transform(place: PacketPlace): string {
    return `translate(${place.x}px, ${place.y}px) translate(-50%, -50%)`
  }
}
