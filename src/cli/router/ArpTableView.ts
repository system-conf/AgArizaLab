// `show arp` / `show ip arp` (docs/CLI.md §7): the device's own addresses (age '-') plus the simulator's ARP
// cache (env.runtime.link.arp), sorted by address. Age = whole minutes since the entry was last updated.
import type { Device, NetworkState } from '../../domain'
import { InterfaceStatus } from '../../net/InterfaceStatus'
import { Ipv4 } from '../../net/Ipv4'
import { L3Interfaces, type L3Interface } from '../../net/L3Interfaces'
import { Topology } from '../../net/Topology'
import type { ArpEntry } from '../../sim/contract'
import { InterfaceNames } from '../core/InterfaceNames'
import { LinkStatus } from '../core/LinkStatus'

const HEADER = 'Protocol  Address          Age (min)  Hardware Addr   Type   Interface'
const MS_PER_MINUTE = 60_000

interface ArpRow {
  readonly ip: string
  readonly age: string
  readonly mac: string
  readonly interfaceId: string | null
}

/** 'AA:BB:CC:DD:EE:FF' → 'AABB.CCDD.EEFF' (Cisco dotted form, as Packet Tracer prints it). */
export function ciscoMac(mac: string): string {
  const hex = mac.replace(/[^0-9A-Fa-f]/g, '').toUpperCase()
  return [hex.slice(0, 4), hex.slice(4, 8), hex.slice(8, 12)].join('.')
}

function macOf(device: Device, iface: L3Interface): string {
  if (iface.portId === undefined) return device.baseMac
  return device.ports.find((port) => port.id === iface.portId)?.mac ?? device.baseMac
}

function ownRows(network: NetworkState, device: Device): ArpRow[] {
  const topology = Topology.of(LinkStatus.withDevice(network, device))
  return L3Interfaces.of(device)
    .filter((iface) => L3Interfaces.isAddressed(iface) && InterfaceStatus.isUp(topology, iface))
    .map((iface) => ({ ip: iface.address, age: '-', mac: ciscoMac(macOf(device, iface)), interfaceId: iface.id }))
}

function learnedRow(entry: ArpEntry, now: number): ArpRow {
  const age = entry.type === 'static' ? '-' : String(Math.max(0, Math.floor((now - entry.updatedAt) / MS_PER_MINUTE)))
  if (entry.mac === null || entry.state === 'incomplete') return { ip: entry.ip, age, mac: 'Incomplete', interfaceId: null }
  return { ip: entry.ip, age, mac: ciscoMac(entry.mac), interfaceId: entry.interfaceId }
}

export class ArpTableView {
  static lines(network: NetworkState, device: Device, arp: readonly ArpEntry[], now: number): string[] {
    const own = ownRows(network, device)
    const ownIps = new Set(own.map((row) => row.ip))
    const learned = arp
      .filter((entry) => (entry.expiresAt === null || entry.expiresAt > now) && !ownIps.has(entry.ip))
      .map((entry) => learnedRow(entry, now))
    const rows = [...own, ...learned].sort((a, b) => (Ipv4.parse(a.ip) ?? 0) - (Ipv4.parse(b.ip) ?? 0))
    return [
      HEADER,
      ...rows.map((row) => {
        const iface = row.interfaceId === null ? '' : `ARPA   ${InterfaceNames.longName(row.interfaceId)}`
        return `Internet  ${row.ip.padEnd(17)}${row.age.padStart(8)}   ${row.mac.padEnd(16)}${iface}`.trimEnd()
      }),
    ]
  }
}
