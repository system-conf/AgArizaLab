// The simulator's terminal and verify checker (docs/SIMULATION.md §10.1): the rule engine's command
// parsing and formatters on the packet simulator's results.
export type { SimCommandOutcome, SimCommandStart } from './CommandStages'
export { PduPaths } from './PduPaths'
export { ProbeOutcomes } from './ProbeOutcomes'
export { SimHostViews } from './SimHostViews'
export { ProbeFailureReasons } from './ProbeFailureReasons'
export { SimProbes, type SimReach } from './SimProbes'
export { SimAppLinks, SimSolveChecker } from './SimSolveChecker'
export { SimTerminal } from './SimTerminal'
