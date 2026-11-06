import { Ipv4 } from '../engine'

/** An IPv4 network in CIDR notation, e.g. '192.168.10.0/24'. */
export interface CidrBlock {
  network: string
  mask: string
}

export class Cidr {
  /** The block, or null when `text` is not 'a.b.c.d/n' with n in 0..32 and a network address. */
  static parse(text: string): CidrBlock | null {
    const [address, length, ...rest] = text.trim().split('/')
    if (address === undefined || length === undefined || rest.length > 0 || !/^\d{1,2}$/.test(length)) return null
    const prefix = Number(length)
    const value = Ipv4.parse(address)
    if (value === null || prefix > 32) return null
    const mask = Ipv4.format(Ipv4.prefixToMask(prefix))
    if (Ipv4.network(address, mask) !== value && prefix > 0) return null
    if (prefix === 0 && value !== 0) return null
    return { network: address, mask }
  }

  /** The connected subnet of an interface address, or null when address or mask is invalid. */
  static ofInterface(address: string, mask: string): CidrBlock | null {
    const network = Ipv4.network(address, mask)
    return network === null ? null : { network: Ipv4.format(network), mask }
  }

  static contains(block: CidrBlock, ip: string): boolean {
    return Ipv4.inNetwork(ip, block.network, block.mask)
  }

  /** True when the two networks share an address (one contains the other). */
  static overlaps(a: CidrBlock, b: CidrBlock): boolean {
    return Cidr.contains(a, b.network) || Cidr.contains(b, a.network)
  }
}
