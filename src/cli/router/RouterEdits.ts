// Pure device edits of the router command set: routing settings, the DHCP and DNS services, and the
// interface the current mode points at. Factory values are stored as absent keys (empty service blocks
// are dropped), so replaying a running-config reproduces the same device.
import type {
  Device,
  DeviceServices,
  DhcpPool,
  DhcpServerSettings,
  DnsServerSettings,
  L3Settings,
  RoutingSettings,
} from '../../domain'
import type { CliContext, CliInterface } from '../contract'
import { DeviceInterfaces } from '../core/DeviceInterfaces'

const EMPTY_DHCP: DhcpServerSettings = { enabled: true, pools: [], excludedRanges: [] }
const EMPTY_DNS: DnsServerSettings = { enabled: false, forwarders: [], records: [] }

/** IOS default of `ip routing`: on for routers, off for L3 switches. */
export function ipRoutingByDefault(device: Device): boolean {
  return device.kind !== 'l3Switch'
}

/** An L3 settings block without an address. */
export function noAddress(): L3Settings {
  return { ipv4: { addressing: 'static', address: '', mask: '' } }
}

function isFactoryDhcp(dhcp: DhcpServerSettings): boolean {
  return dhcp.enabled && dhcp.pools.length === 0 && dhcp.excludedRanges.length === 0
}

function isFactoryDns(dns: DnsServerSettings): boolean {
  return !dns.enabled && dns.forwarders.length === 0 && dns.records.length === 0
}

function withServices(device: Device, services: DeviceServices): Device {
  const copy = { ...device }
  if (Object.keys(services).length === 0) delete copy.services
  else copy.services = services
  return copy
}

export class RouterEdits {
  /** The interface id of the current interface / sub-interface mode. */
  static currentId(ctx: CliContext): string {
    if (ctx.mode.kind === 'interface' || ctx.mode.kind === 'subInterface') return ctx.mode.interfaceId
    throw new Error('Interface command outside interface mode')
  }

  /** The interface of the current mode; undefined for a sub-interface not created yet. */
  static current(ctx: CliContext): CliInterface | undefined {
    return DeviceInterfaces.find(ctx.device, RouterEdits.currentId(ctx))
  }

  static updateRouting(device: Device, change: (routing: RoutingSettings) => RoutingSettings): Device {
    const routing = device.routing ?? { ipRouting: ipRoutingByDefault(device), staticRoutes: [] }
    return { ...device, routing: change(routing) }
  }

  static dhcpOf(device: Device): DhcpServerSettings {
    return device.services?.dhcp ?? EMPTY_DHCP
  }

  static dnsOf(device: Device): DnsServerSettings {
    return device.services?.dns ?? EMPTY_DNS
  }

  static updateDhcp(device: Device, change: (dhcp: DhcpServerSettings) => DhcpServerSettings): Device {
    const dhcp = change(RouterEdits.dhcpOf(device))
    const services: DeviceServices = { ...device.services }
    if (isFactoryDhcp(dhcp)) delete services.dhcp
    else services.dhcp = dhcp
    return withServices(device, services)
  }

  static updateDns(device: Device, change: (dns: DnsServerSettings) => DnsServerSettings): Device {
    const dns = change(RouterEdits.dnsOf(device))
    const services: DeviceServices = { ...device.services }
    if (isFactoryDns(dns)) delete services.dns
    else services.dns = dns
    return withServices(device, services)
  }

  /** Changes the pool `poolId`, creating it first when missing (`ip dhcp pool` creates it at once). */
  static updatePool(device: Device, poolId: string, change: (pool: DhcpPool) => DhcpPool): Device {
    return RouterEdits.updateDhcp(device, (dhcp) => {
      const exists = dhcp.pools.some((pool) => pool.id === poolId)
      const pools = exists
        ? dhcp.pools.map((pool) => (pool.id === poolId ? change(pool) : pool))
        : [...dhcp.pools, change({ id: poolId, network: '', mask: '', defaultRouter: '', dnsServers: [], leases: [] })]
      return { ...dhcp, pools }
    })
  }

  /** The pool of the current `(dhcp-config)` mode. */
  static poolId(ctx: CliContext): string {
    if (ctx.mode.kind === 'dhcpPool') return ctx.mode.poolId
    throw new Error('DHCP pool command outside dhcp-config mode')
  }
}
