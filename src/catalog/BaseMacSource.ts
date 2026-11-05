// Burned-in base MACs for new devices. Port MACs are derived from the base with MacAddress.derive,
// which sets the locally-administered bit and XORs the second octet. Bases here keep a fixed first
// two octets and that bit clear, so a base never equals a derived MAC and two different bases never
// derive the same MAC: lab-wide uniqueness only needs unique bases (4 random octets each).

/** Fixed first two octets of generated bases (unicast, globally-administered form). */
const BASE_PREFIX = [0x00, 0xa0] as const

export interface BaseMacSource {
  /** A new base MAC, 'AA:BB:CC:DD:EE:FF'. */
  next(): string
}

function formatBase(random: readonly number[]): string {
  return [...BASE_PREFIX, ...random].map((octet) => octet.toString(16).toUpperCase().padStart(2, '0')).join(':')
}

/** Cryptographically random bases (the default for the workspace). */
export class RandomBaseMacSource implements BaseMacSource {
  next(): string {
    return formatBase([...crypto.getRandomValues(new Uint8Array(4))])
  }
}

/** Deterministic bases from a seed (mulberry32): same seed, same sequence. For tests and fixtures. */
export class SeededBaseMacSource implements BaseMacSource {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  next(): string {
    const value = this.nextUint32()
    return formatBase([value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff])
  }

  private nextUint32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let mixed = this.state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return (mixed ^ (mixed >>> 14)) >>> 0
  }
}
