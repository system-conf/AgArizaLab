// The Internet checksum (RFC 1071) of IPv4 headers, ICMP messages and the UDP / TCP pseudo-header sum.
import { ByteWriter } from './ByteWriter'

export class InternetChecksum {
  /** One's complement of the one's complement sum of 16-bit words; an odd last byte is padded with 0. */
  static of(...parts: readonly ArrayLike<number>[]): number {
    let sum = 0
    let odd: number | null = null
    for (const part of parts) {
      for (let index = 0; index < part.length; index += 1) {
        const byte = part[index] ?? 0
        if (odd === null) odd = byte
        else {
          sum += (odd << 8) | byte
          odd = null
        }
      }
    }
    if (odd !== null) sum += odd << 8
    while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16)
    return ~sum & 0xffff
  }

  /** UDP / TCP checksum over the IPv4 pseudo-header and the segment (checksum field zeroed). */
  static transport(src: string, dst: string, protocol: number, segment: ArrayLike<number>): number {
    const pseudo = new ByteWriter().ipv4(src).ipv4(dst).u8(0).u8(protocol).u16(segment.length).toBytes()
    return InternetChecksum.of(pseudo, segment)
  }
}
