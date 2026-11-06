// Builders for command trees, so command sets read like the IOS command they define.
import type { Device } from '../../domain'
import type { CliHandler, CliKeywordNode, CliNode, CliParamNode, CliParamSpec, CliWhen } from '../contract'

export interface CliNodeOptions {
  readonly children?: readonly CliNode[]
  readonly run?: CliHandler
  readonly runNo?: CliHandler
  readonly when?: CliWhen
  readonly hidden?: boolean
}

export function keyword(word: string, help: string, options: CliNodeOptions = {}): CliKeywordNode {
  return { kind: 'keyword', word, help, ...options }
}

export function param(name: string, spec: CliParamSpec, help: string, options: CliNodeOptions = {}): CliParamNode {
  return { kind: 'param', name, param: spec, help, ...options }
}

/** Common device filters for `when`. */
export const CliWhens = {
  /** Has a VLAN database (switches, L3 switches, wireless routers). */
  switching: (device: Device): boolean => device.switching !== undefined,
  /** Has routing settings (routers, L3 switches, wireless routers). */
  routing: (device: Device): boolean => device.routing !== undefined,
  /** IOS router platform (routers and wireless routers). */
  routerPlatform: (device: Device): boolean => device.kind === 'router' || device.kind === 'wirelessRouter',
  /** Catalyst platform (switches and L3 switches). */
  switchPlatform: (device: Device): boolean => device.kind === 'switch' || device.kind === 'l3Switch',
} satisfies Record<string, CliWhen>
