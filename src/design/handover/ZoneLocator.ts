import type { Annotation, CanvasPoint, LabLayout, ShapeAnnotation } from '../../domain'
import type { ZoneSummary } from './HandoverTypes'

/**
 * Half the size of a device node on the canvas (workspace DEVICE_NODE_SIZE = 48): layout positions
 * are top-left corners, zones are tested with the node's centre.
 */
const NODE_CENTRE_OFFSET = 24

/** A labelled rectangle / ellipse annotation is a zone ("Kitchen", "Building B"). */
type Zone = ShapeAnnotation & { label: string }

function isZone(annotation: Annotation): annotation is Zone {
  return (annotation.type === 'rectangle' || annotation.type === 'ellipse') && (annotation.label ?? '').trim() !== ''
}

/** Finds the zone each device sits in; with nested zones the smallest one wins. */
export class ZoneLocator {
  private readonly zones: Zone[]
  private readonly layout: LabLayout

  constructor(annotations: readonly Annotation[], layout: LabLayout) {
    this.zones = annotations.filter(isZone).sort((a, b) => a.width * a.height - b.width * b.height)
    this.layout = layout
  }

  zoneOf(deviceId: string): Zone | undefined {
    const position = this.layout.devices[deviceId]
    if (!position) return undefined
    const centre = { x: position.x + NODE_CENTRE_OFFSET, y: position.y + NODE_CENTRE_OFFSET }
    return this.zones.find((zone) => this.contains(zone, centre))
  }

  /** Every zone with the devices inside it, smallest zone first. */
  summaries(deviceIds: readonly string[]): ZoneSummary[] {
    return this.zones.map((zone) => ({
      annotationId: zone.id,
      label: zone.label,
      deviceIds: deviceIds.filter((deviceId) => this.zoneOf(deviceId)?.id === zone.id),
    }))
  }

  private contains(zone: Zone, point: CanvasPoint): boolean {
    const dx = point.x - zone.at.x
    const dy = point.y - zone.at.y
    if (dx < 0 || dy < 0 || dx > zone.width || dy > zone.height) return false
    if (zone.type === 'rectangle') return true
    const rx = zone.width / 2
    const ry = zone.height / 2
    if (rx === 0 || ry === 0) return false
    return ((dx - rx) / rx) ** 2 + ((dy - ry) / ry) ** 2 <= 1
  }
}
