// Packet-level simulator (docs/SIMULATION.md). Contracts + the shared kernel; the layers live in
// src/sim/l2 (S1), src/sim/l3 (S2) and src/sim/services (S3). Wave 3.2 (I3) adds the default wiring:
// `createSimulation(network, options)` = SimulationKernel.create(network, { link, network, services }, options).
export * from './contract'
export * from './core'
