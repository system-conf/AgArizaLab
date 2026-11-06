// UI contract of the simulation (U3, docs/SIMULATION.md §8): what the event list, the PDU inspector and
// the map animation are built from. Pure data; U3 implements the builders in src/features/simulation.
import type { LocalizedMessage } from '../../domain/Messages'
import type { PduLayerView } from './PduLayers'
import type { OsiLayer, SimAction, SimProtocol } from './SimEvent'

/** Realtime: the clock follows the wall clock, requests finish at once. Simulation: the user steps. */
export type SimMode = 'realtime' | 'simulation'

export const PLAY_SPEEDS = [0.25, 0.5, 1, 2, 4] as const
export type PlaySpeed = (typeof PLAY_SPEEDS)[number]

/** Protocols the event list shows; an empty list shows nothing. Filters never change the simulation. */
export interface EventFilter {
  readonly protocols: readonly SimProtocol[]
  /** Only events of these flows (requests); absent = all. */
  readonly flowIds?: readonly string[]
}

export interface PlaybackState {
  readonly mode: SimMode
  readonly playing: boolean
  readonly speed: PlaySpeed
  /** Snapshots kept for step back (U3 decides the depth; at least 100 steps). */
  readonly canStepBack: boolean
  readonly canStepForward: boolean
}

/** One row of the event list (PT: Time, Last Device, At Device, Type). */
export interface EventListItem {
  readonly eventId: number
  readonly time: number
  readonly lastDeviceId?: string
  readonly deviceId: string
  readonly protocol: SimProtocol | null
  readonly action: SimAction
  readonly flowId: string
  /** The action plus the reason, translated by the UI. */
  readonly summary: LocalizedMessage
}

/** One OSI layer row of the inspector's "In" or "Out" column. */
export interface InspectorLayer {
  readonly layer: OsiLayer
  /** e.g. "Ethernet II", "IPv4", "Port Gi0/1" (layer 1). */
  readonly title: LocalizedMessage
  /** The decision notes of this layer (SimEvent.notes filtered by layer and direction). */
  readonly notes: readonly LocalizedMessage[]
}

/** The PDU inspector of one event (PT "PDU Information at Device"). */
export interface InspectorModel {
  readonly eventId: number
  readonly deviceId: string
  readonly inLayers: readonly InspectorLayer[]
  readonly outLayers: readonly InspectorLayer[]
  /** Header fields of the inbound and outbound PDU (tab "PDU details"). */
  readonly inboundDetails: readonly PduLayerView[]
  readonly outboundDetails: readonly PduLayerView[]
  readonly decision: LocalizedMessage
}

/** A packet drawn on the map: on link `linkId`, `fraction` of the way from `fromDeviceId` (0..1). */
export interface PacketMarker {
  readonly transmissionId: number
  readonly linkId: string
  readonly fromDeviceId: string
  readonly toDeviceId: string
  readonly fraction: number
  readonly protocol: SimProtocol
  readonly flowId: string
  /** The frame was dropped at the far end (red mark at the end of its walk). */
  readonly dropped: boolean
}
