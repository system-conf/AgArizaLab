import type { DeviceKind, LabDocument } from '../../../domain'

/** Size of a device node on the workspace canvas; layout positions are its top-left corner. */
const NODE_WIDTH = 64
const NODE_HEIGHT = 56
/** Room around the drawing (labels below nodes). */
const MARGIN = 48
/** Spacing of devices that have no position yet (placed in a row below the others). */
const ROW_SPACING = 96

export interface SketchNode {
  id: string
  name: string
  kind: DeviceKind
  modelId: string
  /** Centre of the node. */
  x: number
  y: number
}

export interface SketchLink {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  connected: boolean
  wireless: boolean
}

export interface SketchZone {
  id: string
  x: number
  y: number
  width: number
  height: number
  label?: string
  ellipse: boolean
}

export interface TopologySketchView {
  viewBox: { x: number; y: number; width: number; height: number }
  zones: SketchZone[]
  links: SketchLink[]
  nodes: SketchNode[]
}

/**
 * A static picture of a lab for the handover pack, drawn from the canvas layout: zones (rectangle /
 * ellipse annotations), cables and devices. Null for a lab without devices. Pure.
 */
export class TopologySketch {
  static build(doc: Pick<LabDocument, 'state' | 'layout' | 'annotations'>): TopologySketchView | null {
    const { devices, links } = doc.state
    if (devices.length === 0) return null
    const placed = devices.flatMap((device) => {
      const at = doc.layout.devices[device.id]
      return at === undefined ? [] : [{ device, x: at.x + NODE_WIDTH / 2, y: at.y + NODE_HEIGHT / 2 }]
    })
    const bottom = placed.reduce((max, node) => Math.max(max, node.y), 0)
    const unplaced = devices
      .filter((device) => doc.layout.devices[device.id] === undefined)
      .map((device, index) => ({ device, x: index * ROW_SPACING, y: bottom + ROW_SPACING }))
    const nodes: SketchNode[] = [...placed, ...unplaced].map(({ device, x, y }) => ({
      id: device.id,
      name: device.name,
      kind: device.kind,
      modelId: device.modelId,
      x,
      y,
    }))
    const at = new Map(nodes.map((node) => [node.id, node]))
    const sketchLinks = links.flatMap((link): SketchLink[] => {
      const a = at.get(link.a.deviceId)
      const b = at.get(link.b.deviceId)
      if (!a || !b) return []
      return [{ id: link.id, x1: a.x, y1: a.y, x2: b.x, y2: b.y, connected: link.connected, wireless: link.cable === 'wireless' }]
    })
    const zones = doc.annotations.flatMap((annotation): SketchZone[] =>
      annotation.type === 'rectangle' || annotation.type === 'ellipse'
        ? [
            {
              id: annotation.id,
              x: annotation.at.x,
              y: annotation.at.y,
              width: annotation.width,
              height: annotation.height,
              ellipse: annotation.type === 'ellipse',
              ...(annotation.label === undefined ? {} : { label: annotation.label }),
            },
          ]
        : [],
    )
    const xs = [...nodes.map((node) => node.x), ...zones.flatMap((zone) => [zone.x, zone.x + zone.width])]
    const ys = [...nodes.map((node) => node.y), ...zones.flatMap((zone) => [zone.y, zone.y + zone.height])]
    const minX = Math.min(...xs) - MARGIN
    const minY = Math.min(...ys) - MARGIN
    return {
      viewBox: { x: minX, y: minY, width: Math.max(...xs) + MARGIN - minX, height: Math.max(...ys) + MARGIN - minY },
      zones,
      links: sketchLinks,
      nodes,
    }
  }
}
