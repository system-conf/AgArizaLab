// The router command set (C3, docs/CLI.md §8): layer-3 interfaces, static routing, DHCP / DNS services,
// the routing show commands, ping and traceroute. Also serves L3 switches (`ip routing`, SVI addresses).
import type { CliCommandSet } from '../contract'
import { dhcpCommands } from './dhcpCommands'
import { interfaceAddressCommands } from './interfaceAddressCommands'
import { probeCommands } from './probeCommands'
import { routerConfigSections, routerInterfaceLines } from './routerConfigSections'
import { routingCommands } from './routingCommands'
import { showCommands } from './showCommands'

export const ROUTER_COMMAND_SET_ID = 'router'

export const routerCommandSet: CliCommandSet = {
  id: ROUTER_COMMAND_SET_ID,
  commands: [...interfaceAddressCommands, ...routingCommands, ...dhcpCommands, ...showCommands, ...probeCommands],
  configSections: routerConfigSections,
  interfaceLines: routerInterfaceLines,
}
