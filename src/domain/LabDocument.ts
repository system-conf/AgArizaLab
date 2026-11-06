// A saved lab: what the workspace edits, autosaves, exports (.agl.json) and shares (MODEL_V2 §9).
import type { NetworkState } from './NetworkState'

/** Current lab file format. Older formats are upgraded by src/lab migrations on load. */
export const LAB_SCHEMA_VERSION = 2

/** Point on the logical workspace canvas (unbounded canvas units; v1 maps used 0..1000 × 0..600). */
export interface CanvasPoint {
  x: number
  y: number
}

export interface LabViewport {
  x: number
  y: number
  zoom: number
}

export interface LabLayout {
  /** Top-left position of each device node, by device id. Every device of the state has one. */
  devices: Record<string, CanvasPoint>
  /** Last canvas view; absent = fit the view to the devices. */
  viewport?: LabViewport
}

/** Named colour tokens (themable), never raw CSS colours. */
export type AnnotationColor = 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'purple'

interface AnnotationBase {
  /** Unique among the lab's annotations. */
  id: string
  color: AnnotationColor
}

/** Free text on the canvas (user content, never translated). */
export interface TextAnnotation extends AnnotationBase {
  type: 'text'
  at: CanvasPoint
  text: string
  size: 'small' | 'medium' | 'large'
}

/** Rectangle or ellipse, e.g. to group "Kitchen" devices; drawn behind devices. */
export interface ShapeAnnotation extends AnnotationBase {
  type: 'rectangle' | 'ellipse'
  /** Top-left corner of the bounding box. */
  at: CanvasPoint
  width: number
  height: number
  label?: string
  filled: boolean
}

export interface LineAnnotation extends AnnotationBase {
  type: 'line'
  from: CanvasPoint
  to: CanvasPoint
  arrow: boolean
}

export type Annotation = TextAnnotation | ShapeAnnotation | LineAnnotation

export interface LabMeta {
  /** User content. */
  title: string
  author?: string
  description?: string
  /** ISO 8601 timestamps, e.g. '2026-11-06T10:00:00.000Z'. */
  createdAt: string
  updatedAt: string
}

export interface LabDocument {
  schemaVersion: typeof LAB_SCHEMA_VERSION
  meta: LabMeta
  state: NetworkState
  layout: LabLayout
  /** The learner's notebook (plain text, user content). */
  notes: string
  annotations: Annotation[]
}
