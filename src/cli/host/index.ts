// Windows host commands the simulator terminal does not answer (docs/CLI.md §7, C4). The UI calls
// HostCommandLayer.run first and falls back to SimTerminal when it returns null.
export { DnsCacheView } from './DnsCacheView'
export { HostCommandLayer, type HostCommandResult } from './HostCommandLayer'
export { NetstatView, type NetstatOptions, type NetstatSocket, type NetstatState } from './NetstatView'
