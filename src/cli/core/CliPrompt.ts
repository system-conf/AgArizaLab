// Prompt rendering: 'Router>', 'R1#', 'S1(config-if-range)#'.
import type { Device, ManagementSettings } from '../../domain'
import type { CliMode, CliModeKind } from '../contract'

const MODE_SUFFIXES: Readonly<Record<CliModeKind, string>> = {
  userExec: '>',
  privilegedExec: '#',
  globalConfig: '(config)#',
  interface: '(config-if)#',
  subInterface: '(config-subif)#',
  interfaceRange: '(config-if-range)#',
  line: '(config-line)#',
  vlan: '(config-vlan)#',
  dhcpPool: '(dhcp-config)#',
  router: '(config-router)#',
}

/** The device's management settings, or the factory ones (`{}`). */
export function managementOf(device: Device): ManagementSettings {
  return device.features?.management ?? {}
}

export class CliPrompt {
  /** `hostname`, or the IOS factory name. */
  static hostname(device: Device): string {
    const configured = managementOf(device).hostname
    return configured !== undefined && configured !== '' ? configured : CliPrompt.defaultHostname(device)
  }

  /** IOS factory name: 'Router' for routers and wireless routers, else 'Switch'. */
  static defaultHostname(device: Device): string {
    return device.kind === 'router' || device.kind === 'wirelessRouter' ? 'Router' : 'Switch'
  }

  static render(device: Device, mode: CliMode): string {
    return `${CliPrompt.hostname(device)}${MODE_SUFFIXES[mode.kind]}`
  }
}
