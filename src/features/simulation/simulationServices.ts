// The simulation UI's only door to the simulator, its terminal, the Web Worker, the pcap encoder and the
// address readers. Components and hooks import from here, so an API change of a neighbour touches one file.
import type { Device, NetworkState } from '../../domain'
import { DeviceAddresses } from '../../engine'
import { createSimulation, SimTerminal, type SimCommandOutcome, type SimulationEngine, type StateEffect } from '../../sim'
import { serviceLayer } from '../../sim/services'
import type { SimWorkerClient } from '../../workers/SimWorkerClient'

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
  type SimCommandOutcome,
  type SimEvent,
  type SimMode,
  type SimPingRequest,
  type SimProtocol,
  type SimRequest,
  type SimSnapshot,
  type SimTransmission,
  type SimulationEngine,
  type StateEffect,
  type StepResult,
} from '../../sim'
export { PcapWriter, type PcapExport } from '../../sim/pcap'
export { simWorkerClient } from '../../workers/SimWorkerClient'

/** Creates the engine of a lab. */
export type EngineFactory = (network: NetworkState) => SimulationEngine

/** The real simulator (S1 link, S2 network, S3 services), settled. */
export const createSimulationEngine: EngineFactory = (network) => createSimulation(network)

/** What the terminal needs of the Web Worker client (a test double can stand in). */
export type WorkerJobs = Pick<SimWorkerClient, 'usesWorker' | 'command'>

/** A command that finished at once, or the request it waits for (Simulation mode). */
export type CommandStart = { readonly kind: 'done'; readonly outcome: SimCommandOutcome } | { readonly kind: 'pending'; readonly requestId: string }

/** The simulator's terminal (docs/SIMULATION.md §10.1). */
export const simTerminal = {
  /** Realtime: runs the command to its end. */
  run(engine: SimulationEngine, deviceId: string, line: string): SimCommandOutcome {
    return SimTerminal.run(engine, deviceId, line)
  },
  /** Simulation: queues the command's request (or answers at once, e.g. `ipconfig`). */
  start(engine: SimulationEngine, deviceId: string, line: string): CommandStart {
    return SimTerminal.start(engine, deviceId, line)
  },
  /** The request `requestId` is done: the command's outcome, or its next request (ping after DNS). */
  collect(engine: SimulationEngine, requestId: string): CommandStart {
    return SimTerminal.collect(engine, requestId)
  },
}

/** The simulation's configuration effects (DHCP leases) applied to a lab state, as the engine does. */
export function applyEffects(state: NetworkState, effects: readonly StateEffect[]): NetworkState {
  return effects.reduce((current, effect) => serviceLayer.applyEffect(current, effect), state)
}

/** Every configured IPv4 address of a device (NICs, routed ports, sub-interfaces, SVIs). */
export function addressesOf(device: Device): string[] {
  return DeviceAddresses.of(device)
}
