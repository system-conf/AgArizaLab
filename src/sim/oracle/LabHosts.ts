// Test-only (O3): the LAN side of a random lab: switches / hub / L3 switch, access point, end devices,
// DHCP pools and host settings (see LabBuilder for the addressing plan).
import type { AppLink, Device, DeviceKind, DeviceServices, DhcpPool, VlanEntry } from '../../domain'
import type { LabBuilder } from './LabBuilder'
import type { HostPlan, LabPlan, LanAccess, LanPlan } from './labPlan'
import { LAN_MASK as MASK, gatewayIp, routerId, subnet } from './labAddresses'
import { LabPorts } from './LabPorts'

/** An end device the builder placed, for the second pass and for the oracle's choice of sources. */
export interface BuiltHost {
  id: string
  routerIndex: number
  /** Subnet index inside the router's LAN (0 or 1). */
  subnetIndex: number
  plan: HostPlan
  /** Planned NIC address ('' = none). */
  address: string
}

const INFRA_DEVICES: Readonly<Record<LanAccess, number>> = { switch: 1, twoSwitches: 2, hub: 1, direct: 0, l3Switch: 1 }

/** Where host number `index` plugs in: [deviceId, portId]. */
type Attach = (index: number) => [string, string] | null

export class LabHosts {
  private readonly builder: LabBuilder

  constructor(builder: LabBuilder) {
    this.builder = builder
  }

  buildLan(requested: LanPlan, index: number): void {
    const wirelessAllowed = requested.access === 'switch' || requested.access === 'twoSwitches' || requested.access === 'l3Switch'
    const extra = requested.wireless && wirelessAllowed ? 2 : 0
    const fits = this.builder.room() >= INFRA_DEVICES[requested.access] + extra + 1
    const plan: LanPlan = fits ? requested : { ...requested, access: 'direct', wireless: null }
    if (!fits && this.builder.room() < 1) return
    const vlanIds = plan.vlans ? [10, 20] : [1]
    const attach = plan.access === 'l3Switch' ? this.buildL3Lan(plan, index, vlanIds) : this.buildRoutedLan(plan, index, vlanIds)
    if (plan.wireless && wirelessAllowed) this.buildWireless(plan, index, vlanIds)
    plan.hosts.forEach((host, number) => {
      if (this.builder.room() < 1) return
      const at = attach(number)
      if (at) this.buildHost(host, index, number, at, plan, vlanIds)
    })
  }

  /** Second pass: settings that refer to other hosts (gateway = another host, DNS server host, AppLinks). */
  finishHosts(plan: LabPlan): void {
    const all = this.builder.hosts
    for (const host of all) {
      const settings = this.builder.device(host.id).host
      if (!settings) continue
      const gateway = host.plan.gateway === 'otherHost' ? this.otherHostGateway(host) : settings.defaultGateway
      const dnsServers = host.plan.dns.map((choice) => this.dnsServer(choice, host, plan.routers.length))
      const appLinks = this.appLinks(host)
      this.builder.edit(host.id, (device) => ({ ...device, host: { defaultGateway: gateway, dnsServers, appLinks } }))
    }
  }

  private buildRoutedLan(plan: LanPlan, index: number, vlanIds: number[]): Attach {
    const router = routerId(index)
    const helpers = plan.dhcp?.relay ? ['10.250.0.67'] : undefined
    if (plan.vlans) {
      const subs = vlanIds.map((vlan, subnetIndex) =>
        LabPorts.subInterface('Gi0/0', vlan, gatewayIp(index, subnetIndex), MASK, subnetIndex === 0 && plan.nativeSubInterface, helpers),
      )
      this.builder.editPort(router, 'Gi0/0', LabPorts.routed('', '', subs))
    } else {
      this.builder.editPort(router, 'Gi0/0', LabPorts.routed(gatewayIp(index, 0), MASK, [], helpers))
    }
    this.addPools(router, plan, index, vlanIds.length)
    switch (plan.access) {
      case 'direct':
        return (number) => (number === 0 ? [router, 'Gi0/0'] : null)
      case 'hub': {
        const hub = `hub${index + 1}`
        this.builder.create('hub8', hub)
        this.builder.link([router, 'Gi0/0'], [hub, 'Port1'])
        return (number) => [hub, `Port${number + 2}`]
      }
      default:
        return this.buildSwitches(plan, index, vlanIds)
    }
  }

  private buildSwitches(plan: LanPlan, index: number, vlanIds: number[]): Attach {
    const first = `switch${index + 1}a`
    const uplink = plan.vlans ? LabPorts.trunk(plan.switchPlan.nativeVlan, this.allowed(plan)) : LabPorts.access(1)
    this.createSwitch(first, plan, index, vlanIds, 250)
    this.builder.editPort(first, 'Fa0/1', LabPorts.switchport(uplink))
    this.builder.link([routerId(index), 'Gi0/0'], [first, 'Fa0/1'])
    if (plan.access !== 'twoSwitches') return (number) => [first, `Fa0/${number + 2}`]
    const second = `switch${index + 1}b`
    this.createSwitch(second, plan, index, vlanIds, 251)
    const between = plan.vlans ? LabPorts.trunk(plan.switchPlan.nativeVlan, 'all') : LabPorts.access(1)
    this.builder.editPort(first, 'Fa0/8', LabPorts.switchport(between))
    this.builder.editPort(second, 'Fa0/8', LabPorts.switchport(between))
    this.builder.link([first, 'Fa0/8'], [second, 'Fa0/8'])
    return (number) => [number % 2 === 0 ? first : second, `Fa0/${number + 2}`]
  }

  /** `managementOctet`: last octet of the management SVI (Vlan1) address, distinct per switch. */
  private createSwitch(id: string, plan: LanPlan, index: number, vlanIds: number[], managementOctet: number): void {
    this.builder.create('switch8', id)
    const management = plan.switchPlan.managementSvi && !plan.vlans
    this.builder.edit(id, (device) => ({
      ...device,
      switching: {
        vlans: this.database(plan, vlanIds),
        svis: [{ vlan: 1, adminUp: management, l3: LabPorts.l3Settings(management ? `${subnet(index, 0)}.${managementOctet}` : '', management ? MASK : '') }],
        defaultGateway: management ? gatewayIp(index, 0) : '',
      },
    }))
  }

  private buildL3Lan(plan: LanPlan, index: number, vlanIds: number[]): Attach {
    const router = routerId(index)
    const id = `l3sw${index + 1}`
    this.builder.editPort(router, 'Gi0/0', LabPorts.routed(`172.30.${index}.1`, MASK))
    this.builder.create('l3Switch24', id)
    this.builder.editPort(id, 'Gi1/0/24', LabPorts.routed(`172.30.${index}.2`, MASK))
    this.builder.link([router, 'Gi0/0'], [id, 'Gi1/0/24'])
    const helpers = plan.dhcp?.relay ? ['10.250.0.67'] : undefined
    this.builder.edit(id, (device) => ({
      ...device,
      switching: {
        vlans: this.database(plan, vlanIds),
        svis: vlanIds.map((vlan, subnetIndex) => ({ vlan, adminUp: true, l3: LabPorts.l3Settings(gatewayIp(index, subnetIndex), MASK, helpers) })),
        defaultGateway: '',
      },
      routing: { ipRouting: plan.l3Routing, staticRoutes: [{ prefix: '0.0.0.0', mask: '0.0.0.0', adminDistance: 1, nextHop: `172.30.${index}.1` }] },
    }))
    this.addPools(id, plan, index, vlanIds.length)
    return (number) => [id, `Gi1/0/${number + 1}`]
  }

  private buildWireless(plan: LanPlan, index: number, vlanIds: number[]): void {
    const wireless = plan.wireless
    if (!wireless) return
    const ap = `ap${index + 1}`
    const switchId = plan.access === 'l3Switch' ? `l3sw${index + 1}` : plan.access === 'twoSwitches' ? `switch${index + 1}b` : `switch${index + 1}a`
    const switchPort = plan.access === 'l3Switch' ? 'Gi1/0/23' : 'Fa0/7'
    const vlan = vlanIds[0] ?? 1
    this.builder.create('accessPoint', ap)
    this.builder.edit(ap, (device) => ({ ...device, wireless: { ssids: [{ ssid: 'Lan', vlan, security: { mode: 'open' } }] } }))
    this.builder.editPort(switchId, switchPort, LabPorts.switchport(LabPorts.trunk(1, 'all')))
    this.builder.link([switchId, switchPort], [ap, 'Gi0'])
    const client = `wifi${index + 1}`
    this.builder.create(wireless.client, client)
    const dhcp = plan.dhcp !== null && !plan.dhcp.relay
    const address = dhcp ? '' : `${subnet(index, 0)}.60`
    this.builder.editPort(client, 'wlan0', LabPorts.nic(dhcp ? 'dhcp' : 'static', address, dhcp ? '' : MASK))
    this.builder.edit(client, (device) => ({ ...device, host: { defaultGateway: dhcp ? '' : gatewayIp(index, 0), dnsServers: [], appLinks: [] } }))
    this.builder.link([client, 'wlan0'], [ap, 'Radio0'], wireless.ssidMatches ? 'Lan' : 'Other')
    const plain: BuiltHost['plan'] = { model: 'pc', vlanIndex: 0, addressing: dhcp ? 'dhcp' : 'static', hostOctet: 60, gateway: 'correct', dns: ['router'], appLink: null, serverDns: false, serverDhcp: false }
    this.builder.hosts.push({ id: client, routerIndex: index, subnetIndex: 0, plan: plain, address })
  }

  private buildHost(host: HostPlan, index: number, number: number, at: [string, string], plan: LanPlan, vlanIds: number[]): void {
    const subnetIndex = plan.vlans ? host.vlanIndex : 0
    const id = `${host.model}${index + 1}${String.fromCharCode(97 + number)}`
    const net = subnet(index, subnetIndex)
    this.builder.create(host.model, id)
    const address = host.addressing === 'static' ? `${net}.${host.hostOctet}` : host.addressing === 'dhcpLeased' ? `${net}.${100 + host.hostOctet}` : ''
    const mode = host.addressing === 'dhcp' || host.addressing === 'dhcpLeased' ? 'dhcp' : 'static'
    this.builder.editPort(id, 'eth0', LabPorts.nic(mode, address, address === '' ? '' : MASK))
    const gateway = { correct: `${net}.1`, none: '', otherHost: '', outside: `10.${index + 1}.${subnetIndex + 101}.1`, missingAddress: `${net}.254` }[host.gateway]
    this.builder.edit(id, (device) => ({ ...device, host: { defaultGateway: gateway, dnsServers: [], appLinks: [] }, ...this.serverServices(host, net, address) }))
    const [deviceId, portId] = at
    if (deviceId !== routerId(index) && !portId.startsWith('Port')) {
      this.builder.editPort(deviceId, portId, LabPorts.switchport(LabPorts.access(vlanIds[subnetIndex] ?? 1)))
    }
    this.builder.link([id, 'eth0'], at)
    this.builder.hosts.push({ id, routerIndex: index, subnetIndex, plan: host, address })
  }

  private serverServices(host: HostPlan, net: string, address: string): Pick<Device, 'services'> {
    if (host.model !== 'server' || address === '' || (!host.serverDns && !host.serverDhcp)) return {}
    const services: DeviceServices = {}
    if (host.serverDns) {
      services.dns = {
        enabled: true,
        forwarders: ['8.8.8.8'],
        records: [
          { type: 'A', name: 'intranet.local', address },
          { type: 'A', name: 'printer.local', address: `${net}.200` },
        ],
      }
    }
    if (host.serverDhcp) {
      const pool: DhcpPool = { id: 'srv', network: `${net}.0`, mask: MASK, range: { start: `${net}.150`, end: `${net}.160` }, defaultRouter: `${net}.1`, dnsServers: [address], leases: [] }
      services.dhcp = { enabled: true, pools: [pool], excludedRanges: [] }
    }
    return { services }
  }

  private addPools(serverId: string, plan: LanPlan, index: number, subnets: number): void {
    const dhcp = plan.dhcp
    if (!dhcp || dhcp.relay) return
    const pools: DhcpPool[] = Array.from({ length: subnets }, (_, subnetIndex) => {
      const net = subnet(index, subnetIndex)
      return {
        id: `pool${subnetIndex + 1}`,
        network: `${net}.0`,
        mask: MASK,
        range: { start: `${net}.100`, end: dhcp.range === 'tiny' ? `${net}.101` : `${net}.200` },
        defaultRouter: dhcp.wrongRouter ? `${net}.254` : `${net}.1`,
        dnsServers: [`${net}.1`],
        leases: [],
      }
    })
    const excludedRanges = dhcp.exclusions ? [{ start: `${subnet(index, 0)}.100`, end: `${subnet(index, 0)}.100` }] : []
    this.builder.edit(serverId, (device) => ({ ...device, services: { ...device.services, dhcp: { enabled: true, pools, excludedRanges } } }))
  }

  private database(plan: LanPlan, vlanIds: number[]): VlanEntry[] {
    const ids = [...new Set([1, ...vlanIds])].filter((vlan) => !(plan.switchPlan.missingVlan && vlan === 20))
    return ids.map((vlan) => ({ id: vlan, name: vlan === 1 ? 'default' : `VLAN${String(vlan).padStart(4, '0')}` }))
  }

  private allowed(plan: LanPlan): 'all' | number[] {
    switch (plan.switchPlan.allowed) {
      case 'all':
        return 'all'
      case 'firstOnly':
        return [10]
      case 'explicit':
        return [1, 10, 20]
    }
  }

  private otherHostGateway(host: BuiltHost): string {
    const other = this.builder.hosts.find(
      (candidate) => candidate.id !== host.id && candidate.routerIndex === host.routerIndex && candidate.subnetIndex === host.subnetIndex && candidate.address !== '',
    )
    return other?.address ?? `${subnet(host.routerIndex, host.subnetIndex)}.253`
  }

  private dnsServer(choice: HostPlan['dns'][number], host: BuiltHost, routers: number): string {
    switch (choice) {
      case 'router':
        return gatewayIp(host.routerIndex, host.subnetIndex)
      case 'public':
        return '8.8.8.8'
      case 'bogus':
        return '10.250.0.53'
      case 'otherRouter':
        return gatewayIp((host.routerIndex + 1) % routers, 0)
      case 'server':
        return this.builder.hosts.find((candidate) => candidate.plan.model === 'server' && candidate.plan.serverDns && candidate.address !== '')?.address ?? '10.250.0.54'
    }
  }

  private appLinks(host: BuiltHost): AppLink[] {
    const link = host.plan.appLink
    if (!link) return []
    if (link.target === 'internet') return [{ id: 'web', label: 'web', targetIp: '8.8.8.8', targetKind: link.kindMatches ? 'internet' : 'server' }]
    const all = this.builder.hosts
    const target = all[link.target % all.length]
    if (!target || target.id === host.id || target.address === '') return []
    const kind = this.builder.device(target.id).kind
    const wrongKind: DeviceKind = kind === 'printer' ? 'camera' : 'printer'
    return [{ id: 'app', label: 'app', targetIp: target.address, targetKind: link.kindMatches ? kind : wrongKind }]
  }
}
