// MAC address helpers shared by the migration, the catalog (new devices) and the lab validator.

const MAC_PATTERN = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/

/** Bit 1 of the first octet: locally administered (not a burned-in vendor address). */
const LOCALLY_ADMINISTERED = 0x02

export class MacAddress {
  /** 'AA:BB:CC:DD:EE:FF' (either case). */
  static isValid(mac: string): boolean {
    return MAC_PATTERN.test(mac)
  }

  /** Upper-case canonical form. Invalid input is a programmer error. */
  static normalize(mac: string): string {
    return MacAddress.format(MacAddress.parse(mac))
  }

  /**
   * Deterministic MAC for the `index`-th extra interface of a device (1..255): the base MAC with
   * the locally-administered bit set and the second octet XOR `index`. Never equal to a burned-in
   * base (those have the bit clear) and different for every index of one base.
   */
  static derive(baseMac: string, index: number): string {
    if (!Number.isInteger(index) || index < 1 || index > 255) {
      throw new Error(`MAC derivation index out of range: ${index}`)
    }
    const [first = 0, second = 0, ...rest] = MacAddress.parse(baseMac)
    return MacAddress.format([first | LOCALLY_ADMINISTERED, second ^ index, ...rest])
  }

  private static parse(mac: string): number[] {
    if (!MacAddress.isValid(mac)) throw new Error(`Invalid MAC address: ${mac}`)
    return mac.split(':').map((octet) => Number.parseInt(octet, 16))
  }

  private static format(octets: number[]): string {
    return octets.map((octet) => octet.toString(16).toUpperCase().padStart(2, '0')).join(':')
  }
}
