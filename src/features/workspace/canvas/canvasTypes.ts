import type { Edge, Node } from '@xyflow/react'
import type { Annotation, Device, Link, LinkLight } from '../../../domain'

/** How a device looks while the cable tool is active. */
export type CableHighlight = 'none' | 'usable' | 'unusable' | 'firstEnd'

export interface WorkspaceDeviceData extends Record<string, unknown> {
  device: Device
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

/** An end of a cable on the canvas: gets the port label and the link light. */
export interface SwitchEnd {
  side: 'source' | 'target'
  portId: string
}

export interface LinkEdgeData extends Record<string, unknown> {
  link: Link
  light: LinkLight
  wireless: boolean
  switchEnds: SwitchEnd[]
}

export type LinkFlowEdge = Edge<LinkEdgeData, 'link'>
