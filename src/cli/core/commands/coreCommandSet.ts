// The core command set (K4): mode navigation, management, lines, interfaces, config files. CliShell always
// registers it first; C2 / C3 add their sets after it (docs/CLI.md §8).
import type { CliCommandSet } from '../../contract'
import { coreConfigSections, coreInterfaceLines } from '../coreConfigSections'
import { ConfigFileCommands, type ConfigFileDeps } from './configFileCommands'
import { execCommands } from './execCommands'
import { interfaceCommands } from './interfaceCommands'
import { lineCommands } from './lineCommands'
import { managementCommands } from './managementCommands'

export const CORE_COMMAND_SET_ID = 'core'

export function createCoreCommandSet(deps: ConfigFileDeps): CliCommandSet {
  return {
    id: CORE_COMMAND_SET_ID,
    commands: [
      ...execCommands,
      ...new ConfigFileCommands(deps).registrations(),
      ...managementCommands,
      ...lineCommands,
      ...interfaceCommands,
    ],
    configSections: coreConfigSections,
    interfaceLines: coreInterfaceLines,
  }
}
