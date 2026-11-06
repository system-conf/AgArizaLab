// Simulation UI (docs/SIMULATION.md §8): what the workspace mounts. The panel and the map layer are
// loaded on demand by the workspace (`SimulationPanel.tsx`, `SimulationMapLayer.tsx`), so they are not
// re-exported here.
export { default as SimplePduHint } from './SimplePduHint'
export { default as SimulationToolbar } from './SimulationToolbar'
export { useSimulation, type SimulationOptions, type WorkspaceSimulation, type WorkspaceTerminal } from './useSimulation'
export type { CommandResult, FinishedCommand } from './model/SimulationTerminal'
