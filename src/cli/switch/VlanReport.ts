// `show vlan` / `show vlan brief`, IOS 12.2 (Catalyst 2960) layout and column widths.
import type { Device, VlanEntry } from '../../domain'
import { VlanDatabase } from './VlanDatabase'

const HEADER = 'VLAN Name                             Status    Ports'
const RULE = '---- -------------------------------- --------- -------------------------------'
/** Ports column starts here; port names wrap so a line stays within 79 characters. */
const PORTS_COLUMN = 48
const PORTS_WIDTH = 31

/** Legacy media of the default VLANs 1002–1005 in the second `show vlan` table. */
const RESERVED_TYPES: Readonly<Record<number, { type: string; stp: string }>> = {
  1002: { type: 'fddi', stp: '-' },
  1003: { type: 'tr', stp: '-' },
  1004: { type: 'fdnet', stp: 'ieee' },
  1005: { type: 'trnet', stp: 'ibm' },
}

export class VlanReport {
  /** `show vlan brief`. */
  static brief(device: Device): string[] {
    return [HEADER, RULE, ...VlanReport.rows(device)]
  }

  /** `show vlan`: the brief table, then the VLAN parameters, Remote SPAN and private VLAN tables. */
  static full(device: Device): string[] {
    const parameters = VlanReport.all(device).map((vlan) => {
      const reserved = RESERVED_TYPES[vlan.id]
      const type = reserved?.type ?? 'enet'
      const said = String(100000 + vlan.id)
      return [
        String(vlan.id).padEnd(4),
        type.padEnd(5),
        said.padEnd(10),
        '1500 ',
        '-     ',
        '-     ',
        '-       ',
        (reserved?.stp ?? '-').padEnd(4),
        '-       ',
        '0     ',
        '0',
      ].join(' ')
    })
    return [
      ...VlanReport.brief(device),
      '',
      'VLAN Type  SAID       MTU   Parent RingNo BridgeNo Stp  BrdgMode Trans1 Trans2',
      '---- ----- ---------- ----- ------ ------ -------- ---- -------- ------ ------',
      ...parameters,
      '',
      'Remote SPAN VLANs',
      '------------------------------------------------------------------------------',
      '',
      '',
      'Primary Secondary Type              Ports',
      '------- --------- ----------------- ------------------------------------------',
    ]
  }

  /** Access ports of each VLAN, IOS short names ('Fa0/1', 'Gi0/1'). Trunks and routed ports are not listed. */
  static portsOf(device: Device, vlan: number): string[] {
    return device.ports.flatMap((port) => (port.role === 'switched' && port.l2.mode === 'access' && port.l2.accessVlan === vlan ? [port.id] : []))
  }

  /** Database VLANs, then the default VLANs 1002–1005. */
  private static all(device: Device): VlanEntry[] {
    return [...VlanDatabase.entries(device), ...VlanDatabase.reserved()]
  }

  private static rows(device: Device): string[] {
    return VlanReport.all(device).flatMap((vlan) => {
      const status = VlanDatabase.isReserved(vlan.id) ? 'act/unsup' : 'active'
      const head = `${String(vlan.id).padEnd(4)} ${vlan.name.slice(0, 32).padEnd(32)} ${status.padEnd(9)} `
      const [first = '', ...rest] = VlanReport.wrapPorts(VlanReport.portsOf(device, vlan.id))
      return [`${head}${first}`.trimEnd(), ...rest.map((line) => `${' '.repeat(PORTS_COLUMN)}${line}`)]
    })
  }

  /** 'Fa0/1, Fa0/2, Fa0/3, Fa0/4' per line, wrapped at the column width. */
  private static wrapPorts(ports: readonly string[]): string[] {
    const lines: string[] = []
    let current = ''
    for (const port of ports) {
      const next = current === '' ? port : `${current}, ${port}`
      if (current !== '' && next.length > PORTS_WIDTH) {
        lines.push(current)
        current = port
      } else {
        current = next
      }
    }
    if (current !== '') lines.push(current)
    return lines
  }
}
