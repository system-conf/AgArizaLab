// LabDocument → React Flow nodes and edges. Positions and selection come from the workspace,
// never from React Flow's own state (controlled flow).
import type { Annotation, CanvasPoint, DeviceV2, LabDocument, LinkV2 } from '../../../domain/v2'
import type { LinkLight } from '../../../domain/EngineContract'
import type { Link } from '../../../domain/NetworkTypes'
import type { LinkFlowEdge } from '../../map/mapTypes'
import { ANNOTATION_NODE_PREFIX } from '../workspaceConstants'
import type { AnnotationNode, CableHighlight, WorkspaceDeviceNode, WorkspaceNode, WorkspaceSelection } from './canvasTypes'

export type MeasuredSizes = Readonly<Record<string, { width: number; height: number }>>

export function annotationNodeId(annotationId: string): string {
  return `${ANNOTATION_NODE_PREFIX}${annotationId}`
}

/** Annotation id of a node id, or null for a device node. */
export function annotationIdOf(nodeId: string): string | null {
  return nodeId.startsWith(ANNOTATION_NODE_PREFIX) ? nodeId.slice(ANNOTATION_NODE_PREFIX.length) : null
}

/** Top-left point of an annotation's node (lines are not drawn as nodes). */
export function annotationPosition(annotation: Annotation): CanvasPoint | null {
  return annotation.type === 'line' ? null : annotation.at
}

/** The annotation moved to `to` (top-left of its node). */
export function moveAnnotation(annotation: Annotation, to: CanvasPoint): Annotation {
  if (annotation.type !== 'line') return { ...annotation, at: to }
  const dx = to.x - annotation.from.x
  const dy = to.y - annotation.from.y
  return { ...annotation, from: to, to: { x: annotation.to.x + dx, y: annotation.to.y + dy } }
}

/** The user's text of an annotation: note text or shape label ('' for lines and unlabeled shapes). */
export function annotationText(annotation: Annotation): string {
  if (annotation.type === 'text') return annotation.text
  return annotation.type === 'line' ? '' : (annotation.label ?? '')
}

/** Translated texts the builders need (rebuilt when the language changes). */
export interface FlowLabels {
  device: (device: DeviceV2) => string
  modelName: (device: DeviceV2) => string
  annotation: (annotation: Annotation) => string
  link: (link: LinkV2, a: DeviceV2, b: DeviceV2) => string
}

export interface NodeInput {
  doc: LabDocument
  selection: WorkspaceSelection
  /** Positions of nodes being dragged right now (by node id). */
  dragPositions: Readonly<Record<string, CanvasPoint>>
  measured: MeasuredSizes
  labels: FlowLabels
  cableHighlight: (deviceId: string) => CableHighlight
}

export function buildNodes(input: NodeInput): WorkspaceNode[] {
  const { doc, selection, dragPositions, measured, labels } = input
  const annotationNodes: AnnotationNode[] = []
  for (const annotation of doc.annotations) {
    const at = annotationPosition(annotation)
    if (at === null) continue
    const id = annotationNodeId(annotation.id)
    const isShape = annotation.type === 'rectangle' || annotation.type === 'ellipse'
    annotationNodes.push({
      id,
      type: 'annotation',
      position: dragPositions[id] ?? at,
      data: { annotation },
      selected: selection.annotationIds.includes(annotation.id),
      measured: measured[id],
      ariaLabel: labels.annotation(annotation),
      zIndex: isShape ? -1 : 0,
      ...(isShape ? { width: annotation.width, height: annotation.height } : {}),
    })
  }
  const deviceNodes: WorkspaceDeviceNode[] = doc.state.devices.map((device) => ({
    id: device.id,
    type: 'device',
    position: dragPositions[device.id] ?? doc.layout.devices[device.id] ?? { x: 0, y: 0 },
    data: { device, modelName: labels.modelName(device), cableHighlight: input.cableHighlight(device.id) },
    selected: selection.deviceIds.includes(device.id),
    measured: measured[device.id],
    ariaLabel: labels.device(device),
    className: 'group',
  }))
  // Shapes first so they are drawn behind the devices.
  return [...annotationNodes, ...deviceNodes]
}

/** The v1 link shape the map's LinkEdge draws (it only reads ends, `connected` and the SSID). */
function asMapLink(link: LinkV2): Link {
  const base = { id: link.id, a: link.a, b: link.b, connected: link.connected }
  return link.cable === 'wireless' ? { ...base, ssid: link.ssid } : base
}

export function buildEdges(
  doc: LabDocument,
  selection: WorkspaceSelection,
  lightOf: (link: LinkV2) => LinkLight,
  labels: FlowLabels,
): LinkFlowEdge[] {
  const devicesById = new Map(doc.state.devices.map((device) => [device.id, device]))
  const edges: LinkFlowEdge[] = []
  for (const link of doc.state.links) {
    const deviceA = devicesById.get(link.a.deviceId)
    const deviceB = devicesById.get(link.b.deviceId)
    if (!deviceA || !deviceB) {
      console.warn(`Link ${link.id} points to a missing device; it is not drawn.`)
      continue
    }
    edges.push({
      id: link.id,
      type: 'link',
      source: deviceA.id,
      target: deviceB.id,
      selected: selection.linkIds.includes(link.id),
      ariaLabel: labels.link(link, deviceA, deviceB),
      data: {
        link: asMapLink(link),
        light: lightOf(link),
        wireless: link.cable === 'wireless',
        switchEnds: [
          { side: 'source', portId: link.a.portId },
          { side: 'target', portId: link.b.portId },
        ],
      },
    })
  }
  return edges
}
