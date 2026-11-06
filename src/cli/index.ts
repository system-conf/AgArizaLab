// IOS-style device CLI (Phase 4, docs/CLI.md). Contract types, the shell the UI drives, and the helpers
// command sets (C2 switch, C3 router, packs) build on.
import { CLI_COMMAND_SETS } from './commandSets'
import type { CliCommandSet } from './contract'
import { CliShell } from './core/CliShell'

export * from './contract'
export { CLI_COMMAND_SETS } from './commandSets'
export { CliArgs } from './core/CliArgs'
export { CliErrors } from './core/CliErrors'
export { CliWhens, keyword, param, type CliNodeOptions } from './core/CliNodes'
export { cliError, cliLog, cliMessage, cliText } from './core/CliOutput'
export { CliParamMatcher, paramLabel } from './core/CliParamMatcher'
export { DEFAULT_TERMINAL_LENGTH, MORE_PROMPT, type PagerKey } from './core/CliPager'
export { CliPrompt, managementOf } from './core/CliPrompt'
export { CliShell } from './core/CliShell'
export { CONFIGURED_LOG } from './core/commands/execCommands'
export { BANNER_DELIMITER } from './core/coreConfigSections'
export { DeviceEdits } from './core/DeviceEdits'
export { DeviceInterfaces } from './core/DeviceInterfaces'
export { FactoryReset } from './core/FactoryReset'
export { INTERFACE_TYPES, InterfaceNames, type InterfaceType } from './core/InterfaceNames'
export { LinkStatus } from './core/LinkStatus'
export { PasswordEncoding } from './core/PasswordEncoding'
export { RunningConfigGenerator } from './core/RunningConfigGenerator'

/** The app's shell: core plus every registered command set. Build once and reuse (it is stateless). */
export function createCliShell(sets: readonly CliCommandSet[] = CLI_COMMAND_SETS): CliShell {
  return new CliShell(sets)
}
