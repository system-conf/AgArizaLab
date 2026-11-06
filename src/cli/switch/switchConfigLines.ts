// Running-config output of the switch commands (docs/CLI.md §6): switchport lines, SVI / routed-port
// addresses and `ip default-gateway`. Every line here replays through the switch commands.
import type { Device, Ipv4Settings } from '../../domain'
import type { CliInterface, InterfaceConfigContributor, RunningConfigSection } from '../contract'
import { INTERFACE_LINE_ORDER, RUNNING_CONFIG_ORDER } from '../contract'
import { CliWhens } from '../core/CliNodes'
import { ipv4Of } from './addressCommands'
import { isLayer3Switch } from './switchContext'
import { VlanLists } from './VlanLists'

/**
 * IOS order: access VLAN, trunk encapsulation, native VLAN, allowed VLANs, mode. Factory values are not
 * written; the lab's factory mode is access, so `switchport mode access` never appears (absent = factory).
 */
function switchportLines(device: Device, iface: CliInterface): string[] {
  if (iface.kind !== 'port') return []
  const port = iface.port
  if (port.role === 'routed') return isLayer3Switch(device) ? ['no switchport'] : []
  const { l2 } = port
  const trunk = l2.mode === 'trunk'
  return [
    ...(l2.accessVlan === 1 ? [] : [`switchport access vlan ${l2.accessVlan}`]),
    ...(trunk && isLayer3Switch(device) ? ['switchport trunk encapsulation dot1q'] : []),
    ...(l2.nativeVlan === 1 ? [] : [`switchport trunk native vlan ${l2.nativeVlan}`]),
    ...(l2.allowedVlans === 'all' ? [] : [`switchport trunk allowed vlan ${VlanLists.describe(l2.allowedVlans)}`]),
    ...(trunk ? ['switchport mode trunk'] : []),
  ]
}

function addressLine(ipv4: Ipv4Settings): string {
  if (ipv4.addressing === 'dhcp') return 'ip address dhcp'
  return ipv4.address === '' ? 'no ip address' : `ip address ${ipv4.address} ${ipv4.mask}`
}

export const switchportConfigLines: InterfaceConfigContributor = {
  id: 'switchport',
  order: INTERFACE_LINE_ORDER.switchport,
  lines: switchportLines,
}

/** `ip address` of SVIs and routed ports on Catalyst switches (routers: the router set). */
export const switchAddressConfigLines: InterfaceConfigContributor = {
  id: 'switchAddress',
  order: INTERFACE_LINE_ORDER.ip,
  lines: (device, iface) => {
    if (!CliWhens.switchPlatform(device) || iface.kind === 'subInterface') return []
    const ipv4 = ipv4Of(iface)
    return ipv4 === null ? [] : [addressLine(ipv4)]
  },
}

export const defaultGatewaySection: RunningConfigSection = {
  id: 'defaultGateway',
  order: RUNNING_CONFIG_ORDER.ipRoutes,
  blocks: (device) => {
    const gateway = device.switching?.defaultGateway ?? ''
    return CliWhens.switchPlatform(device) && gateway !== '' ? [[`ip default-gateway ${gateway}`]] : []
  },
}
