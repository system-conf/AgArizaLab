// Switch command set (C2, docs/CLI.md §8). The integrator adds `switchCommandSet` to CLI_COMMAND_SETS next
// to `routerCommandSet` (which owns `ip address`); `standaloneSwitchCommandSet` adds SVI `ip address` itself.
export {
  createSwitchCommandSet,
  standaloneSwitchCommandSet,
  SWITCH_COMMAND_SET_ID,
  switchCommandSet,
  type SwitchCommandSetOptions,
} from './switchCommandSet'
export { VlanDatabase } from './VlanDatabase'
export { VlanLists } from './VlanLists'
