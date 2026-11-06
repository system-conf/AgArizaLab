// `show ip interface brief` (docs/CLI.md §7): every configurable interface of the device with its address,
// method and status, from the configuration plus the link state of the lab.
import type { Device, NetworkState } from '../../domain'
import { VlanRules } from '../../net/VlanRules'
import type { CliInterface } from '../contract'
import { DeviceInterfaces } from '../core/DeviceInterfaces'
import { InterfaceNames } from '../core/InterfaceNames'
import { LinkStatus } from '../core/LinkStatus'

const HEADER = 'Interface              IP-Address      OK? Method Status                Protocol'
const ADMIN_DOWN = 'administratively down'

interface BriefRow {
  readonly address: string
  readonly method: string
  readonly status: string
  readonly protocol: string
}

function stateOf(adminUp: boolean, up: boolean): Pick<BriefRow, 'status' | 'protocol'> {
  if (!adminUp) return { status: ADMIN_DOWN, protocol: 'down' }
  return up ? { status: 'up', protocol: 'up' } : { status: 'down', protocol: 'down' }
}

function addressOf(l3: { readonly ipv4: { readonly addressing: string; readonly address: string } }): Pick<BriefRow, 'address' | 'method'> {
  const { addressing, address } = l3.ipv4
  if (addressing === 'dhcp') return { address: address === '' ? 'unassigned' : address, method: 'DHCP' }
  return address === '' ? { address: 'unassigned', method: 'unset' } : { address, method: 'manual' }
}

/** An SVI is up when its VLAN exists and an up switchport carries the VLAN. */
function sviUp(network: NetworkState, device: Device, vlan: number): boolean {
  if (!VlanRules.inDatabase(device, vlan)) return false
  return device.ports.some(
    (port) => port.role === 'switched' && VlanRules.egress(device, port, vlan) !== undefined && LinkStatus.portUp(network, device, port.id),
  )
}

function rowOf(network: NetworkState, device: Device, iface: CliInterface): BriefRow {
  switch (iface.kind) {
    case 'port': {
      const { port } = iface
      const state = stateOf(port.adminUp, LinkStatus.portUp(network, device, port.id))
      return port.role === 'routed' ? { ...addressOf(port.l3), ...state } : { address: 'unassigned', method: 'manual', ...state }
    }
    case 'subInterface':
      return { ...addressOf(iface.sub.l3), ...stateOf(iface.sub.adminUp, LinkStatus.portUp(network, device, iface.parent.id)) }
    case 'svi':
      return { ...addressOf(iface.svi.l3), ...stateOf(iface.svi.adminUp, sviUp(network, device, iface.svi.vlan)) }
  }
}

export class InterfaceBriefView {
  static lines(network: NetworkState, device: Device): string[] {
    const view = LinkStatus.withDevice(network, device)
    return [
      HEADER,
      ...DeviceInterfaces.list(device).map((iface) => {
        const row = rowOf(view, device, iface)
        const name = InterfaceNames.longName(iface.id)
        return `${name.padEnd(22)} ${row.address.padEnd(16)}YES ${row.method.padEnd(7)}${row.status.padEnd(22)}${row.protocol}`
      }),
    ]
  }
}
