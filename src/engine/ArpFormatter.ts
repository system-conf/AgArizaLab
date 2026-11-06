import type { TerminalLine } from '../domain'
import { textLines } from './terminalLines'

/** One ARP cache entry as `arp -a` lists it. */
export interface ArpEntryView {
  ip: string
  mac: string
  type: 'dynamic' | 'static'
}

/** One interface block of `arp -a`: the adapter's address, its interface index and its entries. */
export interface ArpInterfaceView {
  address: string
  /** Windows prints the interface index in hex ("--- 0xb"). */
  index: number
  entries: readonly ArpEntryView[]
}

/** Width of the "Internet Address" and "Physical Address" columns. */
const COLUMN_WIDTH = 22
const INDENT = '  '

/** Windows-style (English) `arp` output. Pure string building, no network logic. */
export class ArpFormatter {
  /** `arp -a`: one block per interface that has entries; none at all → "No ARP Entries Found." */
  table(interfaces: readonly ArpInterfaceView[]): TerminalLine[] {
    const shown = interfaces.filter((view) => view.entries.length > 0)
    if (shown.length === 0) return textLines(['No ARP Entries Found.'])
    const lines: string[] = []
    for (const view of shown) {
      lines.push('', `Interface: ${view.address} --- 0x${view.index.toString(16)}`, this.row('Internet Address', 'Physical Address', 'Type'))
      for (const entry of view.entries) lines.push(this.row(entry.ip, this.windowsMac(entry.mac), entry.type))
    }
    return textLines(lines)
  }

  /** What Windows prints for missing or unknown arguments (shortened to the forms the lab supports). */
  usage(): TerminalLine[] {
    return textLines([
      '',
      'Displays and modifies the IP-to-Physical address translation tables used by',
      'address resolution protocol (ARP).',
      '',
      'ARP -d *',
      'ARP -a [inet_addr]',
      '',
      '  -a            Displays current ARP entries by interrogating the current',
      '                protocol data.  If inet_addr is specified, the IP and Physical',
      '                addresses for only the specified computer are displayed.  If',
      '                more than one network interface uses ARP, entries for each ARP',
      '                table are displayed.',
      '  -g            Same as -a.',
      '  -d            Deletes the host specified by inet_addr. inet_addr may be',
      '                wildcarded with * to delete all hosts.',
    ])
  }

  private row(address: string, mac: string, type: string): string {
    return `${INDENT}${address.padEnd(COLUMN_WIDTH)}${mac.padEnd(COLUMN_WIDTH)}${type}`
  }

  /** "00-1a-2b-3c-4d-5e": lower case with dashes, like Windows. */
  private windowsMac(mac: string): string {
    return mac.toLowerCase().replaceAll(':', '-')
  }
}
