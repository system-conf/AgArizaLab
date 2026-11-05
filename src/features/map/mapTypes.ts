import type { Edge, Node } from '@xyflow/react'
import type { LinkLight } from '../../domain/EngineContract'
import type { Device, Link } from '../../domain/NetworkTypes'

export interface DeviceNodeData extends Record<string, unknown> {
  device: Device
  /** Address shown under the name; '—' when the device has none. */
  ipLabel: string
}

export type DeviceFlowNode = Node<DeviceNodeData, 'device'>

/** A switch end of a link: gets the port label and the link light. */
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
