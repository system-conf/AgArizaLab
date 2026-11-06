import type { Device } from '../../domain'
import { Ipv4 } from '../../net/Ipv4'
import { type L3Interface, L3Interfaces } from '../../net/L3Interfaces'
import { InterfaceStatus } from '../../net/InterfaceStatus'
import type { Topology } from '../../net/Topology'
import { LIMITED_BROADCAST_IP, UNSPECIFIED_IP } from '../contract'

/**
 * Address questions of the network layer about one device's L3 interfaces: which interface owns an
 * address, broadcasts, the source address a router uses, and the lab's cloud-facing WAN ports.
 */
export class InterfaceAddresses {
  /** Addressed interfaces that carry traffic (InterfaceStatus.isUp), in configuration order. */
  static upAddressed(topology: Topology, device: Device): L3Interface[] {
    return L3Interfaces.of(device).filter((iface) => L3Interfaces.isAddressed(iface) && InterfaceStatus.isUp(topology, iface))
  }

  /**
   * The interface that owns `ip`. Routers own the addresses of their up interfaces only (a down
   * interface loses its local route, as in the rule engine); hosts own every configured address.
   */
  static owner(topology: Topology, device: Device, ip: string, router: boolean): L3Interface | undefined {
    if (!Ipv4.isValid(ip)) return undefined
    return L3Interfaces.of(device).find((iface) => iface.address === ip && (!router || InterfaceStatus.isUp(topology, iface)))
  }

  /** Directed broadcast address of the interface's subnet; null for /31, /32 or no address. */
  static directedBroadcast(iface: L3Interface): string | null {
    if (!L3Interfaces.isAddressed(iface)) return null
    const network = Ipv4.network(iface.address, iface.mask)
    const length = Ipv4.prefixLength(iface.mask)
    if (network === null || length === null || length >= 31) return null
    return Ipv4.format(network + 2 ** (32 - length) - 1)
  }

  /** 255.255.255.255, or the directed broadcast of the interface's subnet. */
  static isBroadcastFor(iface: L3Interface | undefined, ip: string): boolean {
    if (ip === LIMITED_BROADCAST_IP) return true
    return iface !== undefined && InterfaceAddresses.directedBroadcast(iface) === ip
  }

  /** Multicast (224/4) or the limited broadcast. */
  static isGroupAddress(ip: string): boolean {
    const value = Ipv4.parse(ip)
    return value !== null && value >= 0xe0000000
  }

  /** A source an ICMP error may be sent back to: a valid unicast address other than 0.0.0.0. */
  static isUnicastSource(ip: string): boolean {
    return Ipv4.isValid(ip) && ip !== UNSPECIFIED_IP && !InterfaceAddresses.isGroupAddress(ip)
  }

  /**
   * The address a router sends from: the exit (or ingress) interface's own address, else the first
   * addressed up interface (WAN ports are address-less in the lab, SIMULATION.md §12.1). '' = none.
   */
  static sourceAddress(topology: Topology, device: Device, preferred?: L3Interface): string {
    if (preferred && L3Interfaces.isAddressed(preferred)) return preferred.address
    return InterfaceAddresses.upAddressed(topology, device)[0]?.address ?? ''
  }

  /** A routed port whose working link ends at a cloud port (MODEL_V2 §5): the lab's internet uplink. */
  static isCloudFacing(topology: Topology, iface: L3Interface): boolean {
    if (iface.kind !== 'routed' || iface.portId === undefined) return false
    const portId = iface.portId
    return topology.linksAt(iface.deviceId, portId).some((link) => {
      if (!topology.isUp(link)) return false
      const far = topology.farEnd(link, iface.deviceId, portId)
      return far.device?.kind === 'internet' && far.port?.role === 'passive'
    })
  }
}
