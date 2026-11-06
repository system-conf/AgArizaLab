// Small helpers the switch command handlers share: the interface a mode points at, device filters.
import type { Device, SwitchedPort } from '../../domain'
import type { CliCommandResult, CliContext, CliInterface } from '../contract'
import { CliWhens } from '../core/CliNodes'
import { cliError } from '../core/CliOutput'
import { DeviceInterfaces } from '../core/DeviceInterfaces'

/** Catalyst with routing (L3 switch): `no switchport`, `switchport trunk encapsulation`. */
export function isLayer3Switch(device: Device): boolean {
  return CliWhens.switchPlatform(device) && CliWhens.routing(device)
}

/** The interface id of the current interface mode (each member in a range). */
export function currentInterfaceId(ctx: CliContext): string {
  if (ctx.mode.kind === 'interface' || ctx.mode.kind === 'subInterface') return ctx.mode.interfaceId
  throw new Error('Interface command outside interface mode')
}

export function currentInterface(ctx: CliContext): CliInterface | undefined {
  return DeviceInterfaces.find(ctx.device, currentInterfaceId(ctx))
}

/** The switchport the mode points at, or the IOS refusal for SVIs and routed ports. */
export function currentSwitchport(ctx: CliContext): SwitchedPort | CliCommandResult {
  const iface = currentInterface(ctx)
  if (iface?.kind === 'port' && iface.port.role === 'switched') return iface.port
  return { lines: cliError(`Command rejected: ${currentInterfaceId(ctx)} is not a switching port.`) }
}

export function isSwitchport(value: SwitchedPort | CliCommandResult): value is SwitchedPort {
  return 'role' in value
}
