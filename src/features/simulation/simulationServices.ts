// The simulation UI's only door to the simulator, the pcap encoder and the engine's address readers.
// Components and hooks import from here, so an API change of a neighbour touches one file.
import type { Device, NetworkState } from '../../domain'
import { DeviceAddresses } from '../../engine'
import { nullLayers, SimulationKernel, type SimulationEngine } from '../../sim'

export {
  PduLayers,
  PLAY_SPEEDS,
  SIM_PROTOCOLS,
  SimMessages,
  type EventFilter,
  type EventListItem,
  type InspectorLayer,
  type InspectorModel,
  type OsiLayer,
  type IcmpMessage,
  type Ipv4Packet,
  type PacketMarker,
  type Pdu,
  type PduLayerView,
  type PlaySpeed,
  type SimAction,
  type SimEvent,
  type SimMode,
  type SimPingRequest,
  type SimProtocol,
  type SimRequest,
  type SimSnapshot,
  type SimTransmission,
  type SimulationEngine,
  type StepResult,
} from '../../sim'
export { PcapWriter, type PcapExport } from '../../sim/pcap'

/** Creates the engine of a lab. */
export type EngineFactory = (network: NetworkState) => SimulationEngine

/**
 * WAVE 3.2 (I3): replace `nullLayers` with the real stack, i.e. return `createSimulation(network)` from
 * src/sim once S1–S3 are wired. Until then requests end at once and no frame is ever sent.
 */
export const createSimulationEngine: EngineFactory = (network) => SimulationKernel.create(network, nullLayers)

/** Every configured IPv4 address of a device (NICs, routed ports, sub-interfaces, SVIs). */
export function addressesOf(device: Device): string[] {
  return DeviceAddresses.of(device)
}
