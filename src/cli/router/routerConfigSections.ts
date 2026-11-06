// Running-config output of the router command set (docs/CLI.md §6): DHCP, global ip switches, static
// routes, and the interface lines encapsulation / ip address / helper-address / clock rate. Every line
// written here is accepted by a command of this set (round-trip tests in routerConfig.test.ts).
import type { Device, L3Settings, StaticRoute } from '../../domain'
import type { CliInterface, InterfaceConfigContributor, RunningConfigSection } from '../contract'
import { INTERFACE_LINE_ORDER, RUNNING_CONFIG_ORDER } from '../contract'
import { InterfaceNames } from '../core/InterfaceNames'
import { ipRoutingByDefault } from './RouterEdits'

const STATIC_DISTANCE = 1

/** L3 settings of an interface that can carry an address; null for switchports. */
function l3Of(iface: CliInterface): L3Settings | null {
  switch (iface.kind) {
    case 'port':
      return iface.port.role === 'routed' ? iface.port.l3 : null
    case 'subInterface':
      return iface.sub.l3
    case 'svi':
      return iface.svi.l3
  }
}

function routeLine(route: StaticRoute): string {
  const exit = route.exitInterfaceId === undefined ? '' : ` ${InterfaceNames.longName(route.exitInterfaceId)}`
  const nextHop = route.nextHop === undefined ? '' : ` ${route.nextHop}`
  const distance = route.adminDistance === STATIC_DISTANCE ? '' : ` ${route.adminDistance}`
  return `ip route ${route.prefix} ${route.mask}${exit}${nextHop}${distance}`
}

const dhcpSection: RunningConfigSection = {
  id: 'routerDhcp',
  order: RUNNING_CONFIG_ORDER.dhcp,
  blocks: (device) => {
    const dhcp = device.services?.dhcp
    if (dhcp === undefined) return []
    const service = dhcp.enabled ? [] : ['no service dhcp']
    const excluded = dhcp.excludedRanges.map((range) =>
      range.start === range.end ? `ip dhcp excluded-address ${range.start}` : `ip dhcp excluded-address ${range.start} ${range.end}`,
    )
    const pools = dhcp.pools.map((pool) => [
      `ip dhcp pool ${pool.id}`,
      ...(pool.network === '' ? [] : [` network ${pool.network} ${pool.mask}`]),
      ...(pool.defaultRouter === '' ? [] : [` default-router ${pool.defaultRouter}`]),
      ...(pool.dnsServers.length === 0 ? [] : [` dns-server ${pool.dnsServers.join(' ')}`]),
    ])
    return [service, excluded, ...pools]
  },
}

function routingLines(device: Device): string[] {
  const routing = device.routing
  if (routing === undefined || routing.ipRouting === ipRoutingByDefault(device)) return []
  return [routing.ipRouting ? 'ip routing' : 'no ip routing']
}

const ipGlobalSection: RunningConfigSection = {
  id: 'routerIpGlobal',
  order: RUNNING_CONFIG_ORDER.ipGlobal,
  blocks: (device) => {
    const dns = device.services?.dns
    return [
      [
        ...routingLines(device),
        ...(dns?.records ?? []).map((record) => `ip host ${record.name} ${record.address}`),
        ...(dns?.forwarders ?? []).map((server) => `ip name-server ${server}`),
        ...(dns?.enabled === true ? ['ip dns server'] : []),
      ],
    ]
  },
}

const routesSection: RunningConfigSection = {
  id: 'routerIpRoutes',
  order: RUNNING_CONFIG_ORDER.ipRoutes,
  blocks: (device) => [(device.routing?.staticRoutes ?? []).map(routeLine)],
}

const encapsulationLines: InterfaceConfigContributor = {
  id: 'routerEncapsulation',
  order: INTERFACE_LINE_ORDER.encapsulation,
  lines: (_device, iface) => {
    if (iface.kind !== 'subInterface') return []
    return [`encapsulation dot1Q ${iface.sub.vlan}${iface.sub.native === true ? ' native' : ''}`]
  },
}

const ipLines: InterfaceConfigContributor = {
  id: 'routerIp',
  order: INTERFACE_LINE_ORDER.ip,
  lines: (_device, iface) => {
    const l3 = l3Of(iface)
    if (l3 === null) return []
    const { addressing, address, mask } = l3.ipv4
    if (addressing === 'dhcp') return ['ip address dhcp']
    return address === '' ? ['no ip address'] : [`ip address ${address} ${mask}`]
  },
}

const helperLines: InterfaceConfigContributor = {
  id: 'routerHelper',
  order: INTERFACE_LINE_ORDER.helper,
  lines: (_device, iface) => (l3Of(iface)?.helperAddresses ?? []).map((helper) => `ip helper-address ${helper}`),
}

const clockRateLines: InterfaceConfigContributor = {
  id: 'routerClockRate',
  order: INTERFACE_LINE_ORDER.physical,
  lines: (_device, iface) => {
    const rate = iface.kind === 'port' && iface.port.role === 'routed' ? iface.port.serial?.clockRate : undefined
    return rate === undefined ? [] : [`clock rate ${rate}`]
  },
}

export const routerConfigSections: readonly RunningConfigSection[] = [dhcpSection, ipGlobalSection, routesSection]

export const routerInterfaceLines: readonly InterfaceConfigContributor[] = [encapsulationLines, ipLines, helperLines, clockRateLines]
