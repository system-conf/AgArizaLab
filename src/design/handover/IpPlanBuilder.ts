import type { AddressRange, Device, DhcpPool } from '../../domain'
import { Ipv4, L3Interfaces, type L3Interface } from '../../engine'
import { Cidr } from '../Cidr'
import type { AddressHolder, DhcpScope, SubnetRow } from './HandoverTypes'
import type { LabIndex } from './LabIndex'

interface SubnetDraft {
  network: number
  mask: string
  prefix: number
  vlans: Set<number>
  members: AddressHolder[]
  gateways: AddressHolder[]
  dhcp: DhcpScope[]
}

/**
 * The IP plan: one row per subnet that has an addressed interface or a DHCP pool, with its VLANs,
 * gateways, DHCP scopes and members. Sorted by network address.
 */
export class IpPlanBuilder {
  build(index: LabIndex): SubnetRow[] {
    const drafts = new Map<string, SubnetDraft>()
    for (const device of index.state.devices) {
      for (const iface of L3Interfaces.of(device)) {
        if (!L3Interfaces.isAddressed(iface)) continue
        const draft = this.draftOf(drafts, iface.address, iface.mask)
        if (!draft) continue
        const holder: AddressHolder = { ...index.ref(device.id), interfaceId: iface.id, address: iface.address, addressing: iface.addressing }
        draft.members.push(holder)
        if (this.isGateway(device, iface)) draft.gateways.push(holder)
        const vlan = index.vlanOf(iface)
        if (vlan !== undefined) draft.vlans.add(vlan)
      }
      for (const pool of this.enabledPools(device)) {
        const draft = this.draftOf(drafts, pool.network, pool.mask)
        if (draft) draft.dhcp.push(this.scope(index, device, pool, draft))
      }
    }
    return [...drafts.values()].sort((a, b) => a.network - b.network || a.prefix - b.prefix).map((draft) => this.row(draft))
  }

  /**
   * Static router-side interface of a routing device (routed port, sub-interface, SVI). A router port
   * that leases its address (WAN towards the ISP) is a client of that subnet, not its gateway.
   */
  private isGateway(device: Device, iface: L3Interface): boolean {
    return L3Interfaces.isNetworkSide(iface) && iface.addressing === 'static' && L3Interfaces.isRouter(device)
  }

  private enabledPools(device: Device): DhcpPool[] {
    const dhcp = device.services?.dhcp
    return dhcp?.enabled ? dhcp.pools : []
  }

  private draftOf(drafts: Map<string, SubnetDraft>, address: string, mask: string): SubnetDraft | undefined {
    const network = Ipv4.network(address, mask)
    const prefix = Ipv4.prefixLength(mask)
    if (network === null || prefix === null) return undefined
    const key = `${network}/${prefix}`
    let draft = drafts.get(key)
    if (!draft) {
      draft = { network, mask, prefix, vlans: new Set(), members: [], gateways: [], dhcp: [] }
      drafts.set(key, draft)
    }
    return draft
  }

  private scope(index: LabIndex, device: Device, pool: DhcpPool, draft: SubnetDraft): DhcpScope {
    const bounds = Cidr.hostBounds(Ipv4.format(draft.network), draft.mask) ?? { first: '', last: '' }
    const start = pool.range?.start ?? bounds.first
    const end = pool.range?.end ?? bounds.last
    const excluded = (device.services?.dhcp?.excludedRanges ?? []).filter((range) => this.touches(range, bounds.first, bounds.last))
    return { ...index.ref(device.id), poolId: pool.id, start, end, excluded, defaultRouter: pool.defaultRouter, dnsServers: [...pool.dnsServers] }
  }

  private touches(range: AddressRange, firstHost: string, lastHost: string): boolean {
    const start = Ipv4.parse(range.start)
    const end = Ipv4.parse(range.end)
    const first = Ipv4.parse(firstHost)
    const last = Ipv4.parse(lastHost)
    if (start === null || end === null || first === null || last === null) return false
    return start <= last && end >= first
  }

  private row(draft: SubnetDraft): SubnetRow {
    const network = `${Ipv4.format(draft.network)}/${draft.prefix}`
    const size = 2 ** (32 - draft.prefix)
    const gateways = draft.gateways.length > 0 ? draft.gateways : this.poolRouters(draft)
    return {
      network,
      mask: draft.mask,
      vlans: [...draft.vlans].sort((a, b) => a - b),
      gateways,
      dhcp: draft.dhcp,
      members: draft.members,
      usable: size <= 2 ? size : size - 2,
    }
  }

  /** Without a routing interface in the subnet: the members the pools name as default router. */
  private poolRouters(draft: SubnetDraft): AddressHolder[] {
    const routers = new Set(draft.dhcp.map((scope) => scope.defaultRouter).filter((address) => address !== ''))
    return draft.members.filter((member) => routers.has(member.address))
  }
}
