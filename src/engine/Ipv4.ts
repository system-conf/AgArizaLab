// IPv4 helpers: parsing, mask checks, subnet math and private-range detection.
// Addresses are handled as unsigned 32-bit numbers internally.

const OCTET_PATTERN = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/

/** Private / non-routable blocks per PLAN §4.2: 10/8, 172.16/12, 192.168/16, 127/8. */
const PRIVATE_BLOCKS: ReadonlyArray<{ base: string; prefix: number }> = [
  { base: '10.0.0.0', prefix: 8 },
  { base: '172.16.0.0', prefix: 12 },
  { base: '192.168.0.0', prefix: 16 },
  { base: '127.0.0.0', prefix: 8 },
]

/**
 * Special-purpose blocks that are not private yet never reach a public host either:
 * "this network", link-local (APIPA), carrier-grade NAT, multicast and reserved (incl. broadcast).
 */
const SPECIAL_BLOCKS: ReadonlyArray<{ base: string; prefix: number }> = [
  { base: '0.0.0.0', prefix: 8 },
  { base: '169.254.0.0', prefix: 16 },
  { base: '100.64.0.0', prefix: 10 },
  { base: '224.0.0.0', prefix: 4 },
  { base: '240.0.0.0', prefix: 4 },
]

export class Ipv4 {
  /** Returns the address as an unsigned 32-bit number, or null when not a dotted-quad IPv4. */
  static parse(text: string): number | null {
    const parts = text.trim().split('.')
    if (parts.length !== 4) return null
    let value = 0
    for (const part of parts) {
      if (!OCTET_PATTERN.test(part)) return null
      value = value * 256 + Number(part)
    }
    return value
  }

  static format(value: number): string {
    return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join('.')
  }

  static isValid(text: string): boolean {
    return Ipv4.parse(text) !== null
  }

  /** A mask is valid when it is contiguous ones followed by zeros (/1 … /32). */
  static isValidMask(text: string): boolean {
    const value = Ipv4.parse(text)
    if (value === null || value === 0) return false
    const inverted = 0xffffffff - value
    // inverted + 1 must be a power of two for a contiguous mask.
    return ((inverted + 1) & inverted) === 0
  }

  static prefixToMask(prefix: number): number {
    return prefix === 0 ? 0 : (0xffffffff - (2 ** (32 - prefix) - 1))
  }

  /** Network address of `ip` under `mask`, or null when either is invalid. */
  static network(ip: string, mask: string): number | null {
    const ipValue = Ipv4.parse(ip)
    const maskValue = Ipv4.parse(mask)
    if (ipValue === null || maskValue === null || !Ipv4.isValidMask(mask)) return null
    return Ipv4.applyMask(ipValue, maskValue)
  }

  /** True when both addresses fall in the same subnet under `mask`. */
  static sameSubnet(a: string, b: string, mask: string): boolean {
    const networkA = Ipv4.network(a, mask)
    const networkB = Ipv4.network(b, mask)
    return networkA !== null && networkA === networkB
  }

  /**
   * True when `ip` may be used by a host under `mask`: not the network address and not the
   * broadcast address of its subnet. /31 (point-to-point, RFC 3021) and /32 (single address) have
   * no network/broadcast pair, so both of their addresses count as host addresses.
   * Only checks the subnet position; false for an invalid address or mask.
   */
  static isHostAddress(ip: string, mask: string): boolean {
    const ipValue = Ipv4.parse(ip)
    const maskValue = Ipv4.parse(mask)
    if (ipValue === null || maskValue === null || !Ipv4.isValidMask(mask)) return false
    const hostBits = 0xffffffff - maskValue
    if (hostBits <= 1) return true
    const hostPart = ipValue % (hostBits + 1)
    return hostPart !== 0 && hostPart !== hostBits
  }

  static isPrivate(text: string): boolean {
    return Ipv4.inAnyBlock(text, PRIVATE_BLOCKS)
  }

  /** A valid address that a router would forward to the internet (neither private nor special-purpose). */
  static isPublic(text: string): boolean {
    return Ipv4.isValid(text) && !Ipv4.isPrivate(text) && !Ipv4.inAnyBlock(text, SPECIAL_BLOCKS)
  }

  static isLoopback(text: string): boolean {
    const value = Ipv4.parse(text)
    return value !== null && Math.floor(value / 2 ** 24) === 127
  }

  /** Every address from start to end inclusive; empty when invalid or start > end. */
  static range(start: string, end: string): string[] {
    const startValue = Ipv4.parse(start)
    const endValue = Ipv4.parse(end)
    if (startValue === null || endValue === null || startValue > endValue) return []
    const result: string[] = []
    for (let value = startValue; value <= endValue; value += 1) {
      result.push(Ipv4.format(value))
    }
    return result
  }

  private static inAnyBlock(text: string, blocks: ReadonlyArray<{ base: string; prefix: number }>): boolean {
    const value = Ipv4.parse(text)
    if (value === null) return false
    return blocks.some((block) => {
      const base = Ipv4.parse(block.base)
      const mask = Ipv4.prefixToMask(block.prefix)
      return base !== null && Ipv4.applyMask(value, mask) === base
    })
  }

  private static applyMask(value: number, mask: number): number {
    // Bitwise AND on 32-bit signed ints, converted back to unsigned.
    return (value & mask) >>> 0
  }
}
