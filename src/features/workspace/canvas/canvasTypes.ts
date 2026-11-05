import type { Node } from '@xyflow/react'
import type { Annotation, DeviceV2 } from '../../../domain/v2'

/** How a device looks while the cable tool is active. */
export type CableHighlight = 'none' | 'usable' | 'unusable' | 'firstEnd'

export interface WorkspaceDeviceData extends Record<string, unknown> {
  device: DeviceV2
  /** Translated model name (tooltip). */
  modelName: string
  cableHighlight: CableHighlight
}

export type WorkspaceDeviceNode = Node<WorkspaceDeviceData, 'device'>

export interface AnnotationData extends Record<string, unknown> {
  annotation: Annotation
}

export type AnnotationNode = Node<AnnotationData, 'annotation'>

export type WorkspaceNode = WorkspaceDeviceNode | AnnotationNode

/** What is selected on the canvas, by kind. */
export interface WorkspaceSelection {
  deviceIds: readonly string[]
  linkIds: readonly string[]
  annotationIds: readonly string[]
}

export const EMPTY_SELECTION: WorkspaceSelection = { deviceIds: [], linkIds: [], annotationIds: [] }
