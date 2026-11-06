// The app's console sessions and console simulation (one of each; both follow the open lab).
import { appCliShell, loadSimulationRuntime, SIMULATION_ON_DEMAND_DEVICES } from './cliServices'
import { CliSessionStore } from './model/CliSessionStore'
import { CliSimulation } from './model/CliSimulation'

export const cliSessions = new CliSessionStore(appCliShell)

export const cliSimulation = new CliSimulation(
  (network) => loadSimulationRuntime().then((runtime) => runtime.createEngine(network)),
  SIMULATION_ON_DEMAND_DEVICES,
)
