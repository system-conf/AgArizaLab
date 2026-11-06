// The switch command set (C2, docs/CLI.md §8): VLAN database, switchports, switch addressing, show
// commands and their running-config output. Core commands (hostname, lines, copy, reload…) come from the core set.
import type { CliCommandSet } from '../contract'
import { defaultGatewayCommands, ipAddressCommands } from './addressCommands'
import { showCommands } from './showCommands'
import { spanningTreeCommands } from './spanningTreeCommands'
import { defaultGatewaySection, switchAddressConfigLines, switchportConfigLines } from './switchConfigLines'
import { switchportCommands } from './switchportCommands'
import { vlanCommands } from './vlanCommands'

export const SWITCH_COMMAND_SET_ID = 'switch'

export interface SwitchCommandSetOptions {
  /**
   * Also register interface-mode `ip address` (SVIs, L3-switch routed ports) and its running-config lines.
   * The router set (C3) handles `ip address` on every interface, SVIs included, and the registry allows one
   * handler per merged node: turn this on only when the switch set runs without the router set.
   */
  readonly ipAddress: boolean
}

export function createSwitchCommandSet(options: SwitchCommandSetOptions): CliCommandSet {
  return {
    id: SWITCH_COMMAND_SET_ID,
    commands: [
      ...vlanCommands,
      ...switchportCommands,
      ...defaultGatewayCommands,
      ...(options.ipAddress ? ipAddressCommands : []),
      ...spanningTreeCommands,
      ...showCommands,
    ],
    configSections: [defaultGatewaySection],
    interfaceLines: [switchportConfigLines, ...(options.ipAddress ? [switchAddressConfigLines] : [])],
  }
}

/** For CLI_COMMAND_SETS next to `routerCommandSet`, which owns `ip address` (also on SVIs). */
export const switchCommandSet: CliCommandSet = createSwitchCommandSet({ ipAddress: false })

/** The switch set on its own (tests, a CLI without the router set): SVI `ip address` included. */
export const standaloneSwitchCommandSet: CliCommandSet = createSwitchCommandSet({ ipAddress: true })
