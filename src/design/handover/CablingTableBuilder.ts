import type { Link, LinkEnd, SwitchedPort } from '../../domain'
import type { LocalizedMessage } from '../../domain/Messages'
import { localizedMessage } from '../../i18n/messageKeys'
import { DesignLabels } from '../DesignLabels'
import type { CableEnd, CableRow } from './HandoverTypes'
import { LabIndex } from './LabIndex'

/**
 * The port-to-device list: every cable oriented from the network side (switch before router before
 * end device), grouped by that device in lab order and sorted by port.
 */
export class CablingTableBuilder {
  build(index: LabIndex): CableRow[] {
    const rows = index.state.links.map((link) => this.row(index, link))
    return rows.sort(
      (a, b) => index.orderOf(a.from.deviceId) - index.orderOf(b.from.deviceId) || LabIndex.comparePorts(a.from.portId, b.from.portId),
    )
  }

  private row(index: LabIndex, link: Link): CableRow {
    const [from, to] = this.orient(index, link)
    return {
      linkId: link.id,
      from: this.end(index, from),
      to: this.end(index, to),
      cable: link.cable,
      cableLabel: DesignLabels.cable(link.cable),
      connected: link.connected,
      ...(link.cable === 'wireless' ? { ssid: link.ssid } : {}),
    }
  }

  private orient(index: LabIndex, link: Link): [LinkEnd, LinkEnd] {
    const rankA = index.networkRank(link.a.deviceId)
    const rankB = index.networkRank(link.b.deviceId)
    const aFirst = rankA !== rankB ? rankA < rankB : index.orderOf(link.a.deviceId) <= index.orderOf(link.b.deviceId)
    return aFirst ? [link.a, link.b] : [link.b, link.a]
  }

  private end(index: LabIndex, end: LinkEnd): CableEnd {
    const port = index.topology.find(end.deviceId)?.ports.find((candidate) => candidate.id === end.portId)
    const mode = port?.role === 'switched' ? this.mode(port) : undefined
    return { ...index.ref(end.deviceId), portId: end.portId, ...(mode ? { mode } : {}) }
  }

  private mode(port: SwitchedPort): LocalizedMessage {
    const { l2 } = port
    if (l2.mode === 'access') return localizedMessage('design:handover.portMode.access', { vlan: l2.accessVlan })
    if (l2.allowedVlans === 'all') return localizedMessage('design:handover.portMode.trunkAll', { native: l2.nativeVlan })
    return localizedMessage('design:handover.portMode.trunk', { vlans: l2.allowedVlans.join(', '), native: l2.nativeVlan })
  }
}
