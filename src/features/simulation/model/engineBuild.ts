import type { NetworkState } from '../../../domain'
import { loadSimulationRuntime, simulationRuntimeIfLoaded, type SimulationRuntime, type WorkerJobs } from '../simulationServices'
import type { EngineBuild, PlayerEngine } from './SimulationPlayer'

function builtHere(runtime: SimulationRuntime, network: NetworkState): PlayerEngine {
  const engine = runtime.createEngine(network)
  return { engine, runtime, settleTruncated: engine.settleTruncated }
}

async function buildLater(network: NetworkState, worker: WorkerJobs): Promise<PlayerEngine> {
  const runtime = await loadSimulationRuntime()
  if (!worker.usesWorker(network)) return builtHere(runtime, network)
  const prepared = await worker.prepare(network)
  // The worker settled a copy of `network`; the engine keeps the document's own object, so the next
  // edit is compared against it (and an unchanged lab is recognised as unchanged).
  return { engine: runtime.restoreEngine({ ...prepared.snapshot, network }), runtime, settleTruncated: prepared.settleTruncated }
}

/**
 * How the workspace builds a lab's engine (docs/SIMULATION.md §5.5): the simulator's code loads on
 * demand; small labs are then built here (at once when the code is already loaded, e.g. after a
 * reset), large labs are built and settled in the Web Worker and restored here from the snapshot.
 */
export function workspaceEngineBuild(worker: WorkerJobs): EngineBuild {
  return (network) => {
    const runtime = simulationRuntimeIfLoaded()
    if (runtime && !worker.usesWorker(network)) return builtHere(runtime, network)
    return buildLater(network, worker)
  }
}
