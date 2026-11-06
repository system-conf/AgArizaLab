// The CLI feature's only door to the device CLI (src/cli), the simulator loader and the exercise locks
// (except CliAccess, which loads with the workspace and reads only the model capability).
// Components and hooks import from here, so an API change of a neighbour touches one file.
import { createCliShell, type CliShell } from '../../cli'
import { DeviceConfigText, LabConfigExport } from '../../cli/config'

export {
  CliPrompt,
  managementOf,
  MORE_PROMPT,
  type CliControlKey,
  type CliEnvironment,
  type CliInputKind,
  type CliSessionState,
  type CliShell,
  type CliStep,
  type PagerKey,
} from '../../cli'
export { DeviceConfigText, LabConfigExport } from '../../cli/config'
export type { DeviceRuntime, RequestRecord, SimRequest, SimulationEngine } from '../../sim/contract'
export { ExerciseLockPolicy } from '../../session/ExerciseLockPolicy'
export { loadSimulationRuntime, SIMULATION_ON_DEMAND_DEVICES } from '../simulation/simulationServices'

/** The app's shell (core + switch + router command sets). Stateless, so one serves every console. */
export const appCliShell: CliShell = createCliShell()

/** Config text of devices and labs, built on the app's shell. */
export const deviceConfigText = new DeviceConfigText(appCliShell)
export const labConfigExport = new LabConfigExport(appCliShell)
