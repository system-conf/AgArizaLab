// Growable big-endian byte buffer for the wire encoders (network byte order) plus the few
// little-endian fields of the libpcap headers.

const textEncoder = new TextEncoder()

export class ByteWriter {
  private readonly bytes: number[] = []

  get length(): number {
    return this.bytes.length
  }

  u8(value: number): this {
    this.bytes.push(value & 0xff)
    return this
  }

  u16(value: number): this {
    return this.u8(value >>> 8).u8(value)
  }

  u32(value: number): this {
    return this.u16(value >>> 16).u16(value)
  }

  u32le(value: number): this {
    return this.u8(value).u8(value >>> 8).u8(value >>> 16).u8(value >>> 24)
  }

  u16le(value: number): this {
    return this.u8(value).u8(value >>> 8)
  }

  raw(data: ArrayLike<number>): this {
    for (let index = 0; index < data.length; index += 1) this.u8(data[index] ?? 0)
    return this
  }

  zeros(count: number): this {
    for (let index = 0; index < count; index += 1) this.bytes.push(0)
    return this
  }

  /** UTF-8 text (HTTP lines, DHCP host names, NAK messages). */
  text(value: string): this {
    return this.raw(textEncoder.encode(value))
  }

  /** Dotted IPv4 address; anything unparsable is written as 0.0.0.0. */
  ipv4(address: string): this {
    return this.raw(ByteWriter.ipv4Bytes(address))
  }

  /** 'AA:BB:CC:DD:EE:FF'; anything unparsable is written as 00:00:00:00:00:00. */
  mac(address: string): this {
    return this.raw(ByteWriter.macBytes(address))
  }

  /** Overwrites a 16-bit big-endian value already written (checksums, lengths). */
  patchU16(offset: number, value: number): this {
    this.bytes[offset] = (value >>> 8) & 0xff
    this.bytes[offset + 1] = value & 0xff
    return this
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.bytes)
  }

  static ipv4Bytes(address: string): number[] {
    const parts = address.split('.').map((part) => Number(part))
    const valid = parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    return valid ? parts : [0, 0, 0, 0]
  }

  static macBytes(address: string): number[] {
    const parts = address.split(/[:-]/).map((part) => Number.parseInt(part, 16))
    const valid = parts.length === 6 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    return valid ? parts : [0, 0, 0, 0, 0, 0]
  }
}
