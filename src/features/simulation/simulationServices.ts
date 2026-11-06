// The simulation UI's only door to the simulator, its terminal, the Web Worker, the pcap encoder and the
// address readers. Components and hooks import from here, so an API change of a neighbour touches one file.
// Only contracts are imported statically; the simulator's code itself (kernel, layers, terminal, pcap)
// is loaded on demand through `loadSimulationRuntime`, so the workspace opens without it.
import type { Device, NetworkState } from '../../domain'
import { DeviceAddresses } from '../../engine'
import type { PcapExport } from '../../sim/pcap'
import type { SimCommandOutcome, SimSnapshot, SimTransmission, SimulationEngine, StateEffect } from '../../sim'
import type { SimWorkerClient } from '../../workers/SimWorkerClient'

export { PduLayers, PLAY_SPEEDS, SIM_PROTOCOLS, SimMessages } from '../../sim/contract'
export type {
  EventFilter,
  EventListItem,
  InspectorLayer,
  InspectorModel,
  OsiLayer,
  IcmpMessage,
  Ipv4Packet,
  PacketMarker,
  Pdu,
  PduLayerView,
  PlaySpeed,
  SimAction,
  SimCommandOutcome,
  SimEvent,
  SimMode,
  SimPingRequest,
  SimProtocol,
  SimRequest,
  SimSnapshot,
  SimTransmission,
  SimulationEngine,
  StateEffect,
  StepResult,
} from '../../sim'
export type { PcapExport } from '../../sim/pcap'
export { simWorkerClient } from '../../workers/SimWorkerClient'

/** Labs with more devices open without a simulation; it starts when the learner asks for it. */
export const SIMULATION_ON_DEMAND_DEVICES = 300

/** Creates the settled engine of a lab. */
export type EngineFactory = (network: NetworkState) => SimulationEngine

/** What the simulation needs of the Web Worker client (a test double can stand in). */
export type WorkerJobs = Pick<SimWorkerClient, 'usesWorker' | 'command' | 'prepare'>

/** A command that finished at once, or the request it waits for (Simulation mode). */
export type CommandStart = { readonly kind: 'done'; readonly outcome: SimCommandOutcome } | { readonly kind: 'pending'; readonly requestId: string }

/** The simulator's code (`simulationRuntime.ts`), loaded on demand. */
export interface SimulationRuntime {
  /** The real simulator (S1 link, S2 network, S3 services), settled. */
  readonly createEngine: EngineFactory
  /** An engine that continues from `snapshot` (e.g. one settled in the Web Worker). */
  restoreEngine(snapshot: SimSnapshot): SimulationEngine
  /** The simulator's terminal (docs/SIMULATION.md §10.1). */
  readonly terminal: {
    /** Realtime: runs the command to its end. */
    run(engine: SimulationEngine, deviceId: string, line: string): SimCommandOutcome
    /** Simulation: queues the command's request (or answers at once, e.g. `ipconfig`). */
    start(engine: SimulationEngine, deviceId: string, line: string): CommandStart
    /** The request `requestId` is done: the command's outcome, or its next request (ping after DNS). */
    collect(engine: SimulationEngine, requestId: string): CommandStart
  }
  /** The simulation's configuration effects (DHCP leases) applied to a lab state, as the engine does. */
  applyEffects(state: NetworkState, effects: readonly StateEffect[]): NetworkState
  /** The wire frames as a libpcap file; `startEpochMs` = wall time of virtual time 0. */
  writePcap(transmissions: readonly SimTransmission[], startEpochMs: number): PcapExport
}

let loadedRuntime: SimulationRuntime | null = null

/** Loads the simulator's code (one download, cached by the module system). */
export function loadSimulationRuntime(): Promise<SimulationRuntime> {
  return import('./simulationRuntime').then((module) => {
    loadedRuntime = module.simulationRuntime
    return module.simulationRuntime
  })
}

/** The simulator's code if it was loaded already, else null. */
export function simulationRuntimeIfLoaded(): SimulationRuntime | null {
  return loadedRuntime
}

/** Every configured IPv4 address of a device (NICs, routed ports, sub-interfaces, SVIs). */
export function addressesOf(device: Device): string[] {
  return DeviceAddresses.of(device)
}
