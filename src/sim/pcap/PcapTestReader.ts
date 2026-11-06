// Test-only: an independent little parser of the bytes the encoders write, so tests can re-read headers,
// lengths and checksums like Wireshark would.

export class ByteReader {
  readonly bytes: Uint8Array

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
  }

  u8(offset: number): number {
    const value = this.bytes[offset]
    if (value === undefined) throw new Error(`Read past the end at ${offset}`)
    return value
  }

  u16(offset: number): number {
    return (this.u8(offset) << 8) | this.u8(offset + 1)
  }

  u32(offset: number): number {
    return ((this.u16(offset) << 16) | this.u16(offset + 2)) >>> 0
  }

  u32le(offset: number): number {
    return (this.u8(offset) | (this.u8(offset + 1) << 8) | (this.u8(offset + 2) << 16) | (this.u8(offset + 3) << 24)) >>> 0
  }

  ipv4(offset: number): string {
    return [0, 1, 2, 3].map((index) => this.u8(offset + index)).join('.')
  }

  mac(offset: number): string {
    return [0, 1, 2, 3, 4, 5].map((index) => this.u8(offset + index).toString(16).toUpperCase().padStart(2, '0')).join(':')
  }

  text(offset: number, length: number): string {
    return new TextDecoder().decode(this.bytes.subarray(offset, offset + length))
  }

  slice(offset: number, end?: number): ByteReader {
    return new ByteReader(this.bytes.subarray(offset, end))
  }
}

export interface PcapRecord {
  readonly seconds: number
  readonly micros: number
  readonly capturedLength: number
  readonly originalLength: number
  readonly data: ByteReader
}

export interface ParsedPcap {
  readonly magic: number
  readonly versionMajor: number
  readonly versionMinor: number
  readonly snaplen: number
  readonly linkType: number
  readonly records: PcapRecord[]
}

/** Straightforward RFC 1071 sum, written separately from the encoder's implementation. */
export function onesComplementSum(bytes: Uint8Array): number {
  let sum = 0
  for (let index = 0; index < bytes.length; index += 2) {
    const high = bytes[index] ?? 0
    const low = bytes[index + 1] ?? 0
    sum += high * 256 + low
    sum = (sum & 0xffff) + Math.floor(sum / 0x10000)
  }
  return sum
}

/** True when the checksum embedded in `bytes` makes the one's complement sum 0xFFFF. */
export function checksumValid(bytes: Uint8Array): boolean {
  return onesComplementSum(bytes) === 0xffff
}

export function transportChecksumValid(src: string, dst: string, protocol: number, segment: Uint8Array): boolean {
  const pseudo = new Uint8Array(12 + segment.length)
  pseudo.set(src.split('.').map(Number), 0)
  pseudo.set(dst.split('.').map(Number), 4)
  pseudo[9] = protocol
  pseudo[10] = segment.length >>> 8
  pseudo[11] = segment.length & 0xff
  pseudo.set(segment, 12)
  return checksumValid(pseudo)
}

export function readPcap(bytes: Uint8Array): ParsedPcap {
  const reader = new ByteReader(bytes)
  const records: PcapRecord[] = []
  let offset = 24
  while (offset < bytes.length) {
    const capturedLength = reader.u32le(offset + 8)
    records.push({
      seconds: reader.u32le(offset),
      micros: reader.u32le(offset + 4),
      capturedLength,
      originalLength: reader.u32le(offset + 12),
      data: reader.slice(offset + 16, offset + 16 + capturedLength),
    })
    offset += 16 + capturedLength
  }
  return {
    magic: reader.u32le(0),
    versionMajor: reader.u8(4) | (reader.u8(5) << 8),
    versionMinor: reader.u8(6) | (reader.u8(7) << 8),
    snaplen: reader.u32le(16),
    linkType: reader.u32le(20),
    records,
  }
}

export interface ParsedEthernet {
  readonly dst: string
  readonly src: string
  readonly vlan: { readonly vid: number; readonly pcp: number } | null
  readonly etherType: number
  readonly payload: ByteReader
}

export function readEthernet(frame: ByteReader): ParsedEthernet {
  const tagged = frame.u16(12) === 0x8100
  const tci = tagged ? frame.u16(14) : 0
  const typeOffset = tagged ? 16 : 12
  return {
    dst: frame.mac(0),
    src: frame.mac(6),
    vlan: tagged ? { vid: tci & 0x0fff, pcp: tci >>> 13 } : null,
    etherType: frame.u16(typeOffset),
    payload: frame.slice(typeOffset + 2),
  }
}

export interface ParsedIpv4 {
  readonly versionIhl: number
  readonly totalLength: number
  readonly identification: number
  readonly ttl: number
  readonly protocol: number
  readonly src: string
  readonly dst: string
  readonly headerValid: boolean
  readonly payload: ByteReader
}

export function readIpv4(packet: ByteReader): ParsedIpv4 {
  const totalLength = packet.u16(2)
  return {
    versionIhl: packet.u8(0),
    totalLength,
    identification: packet.u16(4),
    ttl: packet.u8(8),
    protocol: packet.u8(9),
    src: packet.ipv4(12),
    dst: packet.ipv4(16),
    headerValid: checksumValid(packet.bytes.subarray(0, 20)),
    payload: packet.slice(20, totalLength),
  }
}

/** DHCP options after the magic cookie (offset 240): code → raw value bytes. */
export function readDhcpOptions(message: ByteReader): Map<number, Uint8Array> {
  const options = new Map<number, Uint8Array>()
  let offset = 240
  while (offset < message.bytes.length) {
    const code = message.u8(offset)
    if (code === 255) break
    if (code === 0) {
      offset += 1
      continue
    }
    const length = message.u8(offset + 1)
    options.set(code, message.bytes.slice(offset + 2, offset + 2 + length))
    offset += 2 + length
  }
  return options
}

/** A DNS name at `offset` (labels or a compression pointer) and the offset after it. */
export function readDnsName(message: ByteReader, offset: number): { name: string; next: number } {
  const labels: string[] = []
  let cursor = offset
  let next: number | null = null
  for (;;) {
    const length = message.u8(cursor)
    if (length === 0) {
      next ??= cursor + 1
      break
    }
    if ((length & 0xc0) === 0xc0) {
      next ??= cursor + 2
      cursor = message.u16(cursor) & 0x3fff
      continue
    }
    labels.push(message.text(cursor + 1, length))
    cursor += 1 + length
  }
  return { name: labels.join('.'), next }
}
