// Packet-level simulator (docs/SIMULATION.md). Contracts + the shared kernel; the layers live in
// src/sim/l2 (S1), src/sim/l3 (S2) and src/sim/services (S3); `createSimulation` wires them (wave 3.2),
// src/sim/terminal maps requests to the host terminal and the verify checker (§10.1).
export * from './contract'
export * from './core'
export { createSimulation, defaultLayers, type SimulationOptions } from './createSimulation'
export {
  PduPaths,
  ProbeOutcomes,
  SimAppLinks,
  SimHostViews,
  SimProbes,
  SimSolveChecker,
  SimTerminal,
  type SimCommandOutcome,
  type SimCommandStart,
  type SimReach,
} from './terminal'
