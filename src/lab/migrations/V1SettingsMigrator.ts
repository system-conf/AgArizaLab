// Device-level v2 settings (host, switching, routing, wireless, services, internet) from a v1
// device (mapping table: docs/MODEL_V2.md §11).
import type { V1Device, V1DhcpPool, V1NetworkState } from './v1Types'
import type {
  DeviceServices,
  DhcpPool,
  HostSettings,
  InternetSettings,
  RoutingSettings,
  SwitchingSettings,
  VlanEntry,
  WirelessSettings,
} from '../../domain'
import { V1_DEVICE_MAP, V1_HOST_KINDS } from './v1DeviceMap'
import { V1MigrationError } from './V1MigrationError'
import { ROUTER_WAN_PORT } from './V1PortMigrator'

/**
 * v1 routers answered DNS by forwarding to "the internet" whenever the WAN was up. v2 makes the
 * upstream explicit: a public resolver the cloud answers (engine internetHosts.publicDnsServers).
 */
export const V1_DNS_FORWARDER = '8.8.8.8'

type V1Bag = 'host' | 'appLinks' | 'switchPorts' | 'routerInterfaces' | 'dhcpPools' | 'wanUp' | 'dnsForwarding' | 'wirelessNetworks'

const ALL_BAGS: readonly V1Bag[] = [
  'host',
  'appLinks',
  'switchPorts',
  'routerInterfaces',
  'dhcpPools',
  'wanUp',
  'dnsForwarding',
  'wirelessNetworks',
]

/** One cable of the cloud device: the v2 cloud port and the v1 device at the other end. */
export interface CloudConnection {
  portId: string
  neighbour: V1Device | undefined
}

export class V1SettingsMigrator {
  /** Every VLAN id the v1 state uses anywhere (plus VLAN 1), ascending. */
  static vlansOf(state: V1NetworkState): number[] {
    const vlans = new Set<number>([1])
    for (const device of state.devices) {
      for (const port of device.switchPorts ?? []) vlans.add(port.vlan)
      for (const routerInterface of device.routerInterfaces ?? []) vlans.add(routerInterface.vlan)
      for (const pool of device.dhcpPools ?? []) vlans.add(pool.vlan)
      for (const network of device.wirelessNetworks ?? []) vlans.add(network.vlan)
    }
    return [...vlans].filter((vlan) => Number.isInteger(vlan) && vlan >= 1 && vlan <= 4094).sort((a, b) => a - b)
  }

  /** Throws when a v1 settings bag sits on a kind that has no v2 place for it (data would be lost). */
  checkBags(device: V1Device): void {
    const allowed = this.allowedBags(device)
    for (const bag of ALL_BAGS) {
      if (device[bag] !== undefined && !allowed.includes(bag)) {
        throw new V1MigrationError('unsupportedSetting', `${device.id}.${bag} on a ${device.kind}`)
      }
    }
  }

  host(device: V1Device): HostSettings | undefined {
    if (!V1_HOST_KINDS.includes(device.kind)) return undefined
    return {
      defaultGateway: device.host?.gateway ?? '',
      dnsServers: [...(device.host?.dns ?? [])],
      appLinks: (device.appLinks ?? []).map((appLink) => ({
        ...appLink,
        targetKind: V1_DEVICE_MAP[appLink.targetKind].kind,
      })),
    }
  }

  /** The VLAN database holds every VLAN of the state, because v1 trunks carried every VLAN. */
  switching(device: V1Device, vlans: readonly number[]): SwitchingSettings | undefined {
    if (device.kind !== 'switch') return undefined
    return { vlans: vlans.map((id) => this.vlanEntry(id)), svis: [], defaultGateway: '' }
  }

  /** v1 routers sent every public destination to the WAN: an explicit default route out Gi0/1. */
  routing(device: V1Device): RoutingSettings | undefined {
    if (device.kind !== 'router') return undefined
    return {
      ipRouting: true,
      staticRoutes: [{ prefix: '0.0.0.0', mask: '0.0.0.0', exitInterfaceId: ROUTER_WAN_PORT, adminDistance: 1 }],
    }
  }

  wireless(device: V1Device): WirelessSettings | undefined {
    if (device.kind !== 'accessPoint') return undefined
    return {
      ssids: (device.wirelessNetworks ?? []).map((network) => ({
        ssid: network.ssid,
        vlan: network.vlan,
        security: { mode: 'open' },
      })),
    }
  }

  services(device: V1Device): DeviceServices | undefined {
    if (device.kind !== 'router') return undefined
    const dns = { enabled: device.dnsForwarding === true, forwarders: [V1_DNS_FORWARDER], records: [] }
    if (device.dhcpPools === undefined) return { dns }
    return {
      dhcp: { enabled: true, pools: device.dhcpPools.map((pool) => this.pool(pool)), excludedRanges: [] },
      dns,
    }
  }

  /** Each cabled cloud port gets a handoff; its service is up when the v1 router had `wanUp: true`. */
  internet(device: V1Device, connections: readonly CloudConnection[]): InternetSettings | undefined {
    if (device.kind !== 'internet') return undefined
    return {
      handoffs: connections.map(({ portId, neighbour }) => ({
        portId,
        serviceUp: neighbour?.kind === 'router' ? neighbour.wanUp === true : true,
      })),
    }
  }

  private allowedBags(device: V1Device): readonly V1Bag[] {
    if (V1_HOST_KINDS.includes(device.kind)) return ['host', 'appLinks']
    switch (device.kind) {
      case 'router':
        return ['routerInterfaces', 'dhcpPools', 'wanUp', 'dnsForwarding']
      case 'switch':
        return ['switchPorts']
      case 'accessPoint':
        return ['wirelessNetworks']
      default:
        return []
    }
  }

  private vlanEntry(id: number): VlanEntry {
    return { id, name: id === 1 ? 'default' : `VLAN${String(id).padStart(4, '0')}` }
  }

  /**
   * v1 pools were bound to a VLAN and handed out rangeStart..rangeEnd. v2 binds a pool to the
   * interface whose subnet contains `network` and keeps the range as the allocation window.
   */
  private pool(pool: V1DhcpPool): DhcpPool {
    return {
      id: pool.id,
      network: this.networkOf(pool.rangeStart, pool.mask),
      mask: pool.mask,
      range: { start: pool.rangeStart, end: pool.rangeEnd },
      defaultRouter: pool.gateway,
      dnsServers: [...pool.dns],
      leases: pool.leases.map((lease) => ({ ...lease })),
    }
  }

  /** Network address of `ip` under `mask`; the input unchanged when either is not dotted IPv4. */
  private networkOf(ip: string, mask: string): string {
    const ipOctets = this.octets(ip)
    const maskOctets = this.octets(mask)
    if (ipOctets === null || maskOctets === null) return ip
    return ipOctets.map((octet, index) => octet & (maskOctets[index] ?? 0)).join('.')
  }

  private octets(address: string): number[] | null {
    const parts = address.split('.')
    if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null
    const octets = parts.map(Number)
    return octets.every((octet) => octet <= 255) ? octets : null
  }
}
