// Export text of a device without an IOS command line (end devices, access points, home routers, hubs,
// the internet cloud): its addressing, routes, SSIDs and services as '!' comment lines, so the lab-wide
// export has one section per device. Comments only: replaying them changes nothing.
import type { Device, DhcpServerSettings, DnsServerSettings, StaticRoute } from '../../domain'
import { type L3Interface, L3Interfaces } from '../../net/L3Interfaces'

const NONE = 'none'

function addressOf(iface: L3Interface): string {
  if (iface.addressing === 'dhcp') return iface.address === '' ? 'DHCP (no lease)' : `${iface.address} ${iface.mask} (DHCP)`
  return iface.address === '' ? 'no address' : `${iface.address} ${iface.mask}`
}

function routeOf(route: StaticRoute): string {
  const via = [route.exitInterfaceId, route.nextHop].filter((part) => part !== undefined).join(' ')
  return `${route.prefix} ${route.mask} ${via}${route.adminDistance === 1 ? '' : ` ${route.adminDistance}`}`
}

function dhcpLines(dhcp: DhcpServerSettings): string[] {
  const lines = [`DHCP server: ${dhcp.enabled ? 'on' : 'off'}`]
  for (const pool of dhcp.pools) {
    const parts = [`network ${pool.network} ${pool.mask}`]
    if (pool.range !== undefined) parts.push(`range ${pool.range.start} - ${pool.range.end}`)
    if (pool.defaultRouter !== '') parts.push(`default-router ${pool.defaultRouter}`)
    if (pool.dnsServers.length > 0) parts.push(`dns-server ${pool.dnsServers.join(' ')}`)
    lines.push(` pool ${pool.id}: ${parts.join(', ')}`)
  }
  for (const range of dhcp.excludedRanges) lines.push(` excluded ${range.start === range.end ? range.start : `${range.start} - ${range.end}`}`)
  return lines
}

function dnsLines(dns: DnsServerSettings): string[] {
  const lines = [`DNS server: ${dns.enabled ? 'on' : 'off'}`]
  if (dns.forwarders.length > 0) lines.push(` forwarders ${dns.forwarders.join(' ')}`)
  for (const record of dns.records) lines.push(` ${record.type} ${record.name} ${record.address}`)
  return lines
}

export class DeviceSummaryText {
  /** The summary, every line a comment; '! No configuration' when there is nothing to show. */
  static lines(device: Device): string[] {
    const body = DeviceSummaryText.body(device)
    if (body.length === 0) return ['! No configuration']
    return ['! No command line: settings from the Config panel', ...body.map((line) => `! ${line}`)]
  }

  private static body(device: Device): string[] {
    const lines: string[] = []
    const isHost = device.host !== undefined
    for (const iface of L3Interfaces.of(device)) {
      if (!isHost && iface.addressing === 'static' && iface.address === '') continue
      lines.push(`${iface.id}: ${addressOf(iface)}${iface.adminUp ? '' : ' (shutdown)'}`)
    }
    if (device.host !== undefined) {
      lines.push(`Default gateway: ${device.host.defaultGateway === '' ? NONE : device.host.defaultGateway}`)
      lines.push(`DNS servers: ${device.host.dnsServers.length === 0 ? NONE : device.host.dnsServers.join(', ')}`)
    }
    for (const route of device.routing?.staticRoutes ?? []) lines.push(`Static route: ${routeOf(route)}`)
    for (const ssid of device.wireless?.ssids ?? []) lines.push(`SSID ${ssid.ssid}: VLAN ${ssid.vlan}, ${ssid.security.mode}`)
    if (device.services?.dhcp !== undefined) lines.push(...dhcpLines(device.services.dhcp))
    if (device.services?.dns !== undefined) lines.push(...dnsLines(device.services.dns))
    return lines
  }
}
