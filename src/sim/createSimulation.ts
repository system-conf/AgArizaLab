import type { NetworkState } from '../domain'
import type { SimLayers, SimOptions, SimulationEngine } from './contract'
import { SimulationKernel } from './core/SimulationKernel'
import { linkLayer } from './l2'
import { networkLayer } from './l3'
import { serviceLayer } from './services'

/** Options of `createSimulation` (seed, settle, latency, retained events). */
export type SimulationOptions = SimOptions

/** The default stack: S1 link layer, S2 network layer, S3 services. */
export const defaultLayers: SimLayers = { link: linkLayer, network: networkLayer, services: serviceLayer }

/** The packet simulator of a lab with the default layers (docs/SIMULATION.md §11, wave 3.2). */
export function createSimulation(network: NetworkState, options?: SimulationOptions): SimulationEngine {
  return SimulationKernel.create(network, defaultLayers, options)
}
