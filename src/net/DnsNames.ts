/** Host name rules shared by the rule engine's resolver and the simulator's DNS services. */
export class DnsNames {
  /** Names are case-insensitive and may end with the root dot. */
  static normalize(name: string): string {
    return name.trim().toLowerCase().replace(/\.$/, '')
  }
}
