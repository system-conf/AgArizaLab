import type { LocalizedMessage } from '../../domain/Messages'
import { localizedMessage, type AppMessageKey } from '../../i18n/messageKeys'
import type {
  DevicePorts,
  HandoverBlock,
  HandoverDocument,
  HandoverLine,
  HandoverPage,
  HandoverSection,
  HandoverSectionId,
  HandoverText,
  OpenIssue,
} from './HandoverTypes'
import { PortRanges } from './PortRanges'

/** Placeholder of an empty cell. */
const NONE = '—'

const COLUMN_KEYS = {
  type: 'design:handover.columns.type',
  count: 'design:handover.columns.count',
  cable: 'design:handover.columns.cable',
  zone: 'design:handover.columns.zone',
  devices: 'design:handover.columns.devices',
  network: 'design:handover.columns.network',
  vlan: 'design:handover.columns.vlan',
  gateway: 'design:handover.columns.gateway',
  dhcp: 'design:handover.columns.dhcp',
  hosts: 'design:handover.columns.hosts',
  name: 'design:handover.columns.name',
  subnets: 'design:handover.columns.subnets',
  accessPorts: 'design:handover.columns.accessPorts',
  trunkPorts: 'design:handover.columns.trunkPorts',
  interfaces: 'design:handover.columns.interfaces',
  ssids: 'design:handover.columns.ssids',
  device: 'design:handover.columns.device',
  model: 'design:handover.columns.model',
  managementIp: 'design:handover.columns.managementIp',
  ports: 'design:handover.columns.ports',
  state: 'design:handover.columns.state',
  origin: 'design:handover.columns.origin',
  port: 'design:handover.columns.port',
  portMode: 'design:handover.columns.portMode',
  connectedTo: 'design:handover.columns.connectedTo',
  farPort: 'design:handover.columns.farPort',
} as const satisfies Record<string, AppMessageKey>

function column(name: keyof typeof COLUMN_KEYS): LocalizedMessage {
  return localizedMessage(COLUMN_KEYS[name])
}

function joined(values: readonly string[]): string {
  return values.length === 0 ? NONE : values.join(', ')
}

function portsCell(groups: readonly DevicePorts[]): string {
  return groups.length === 0 ? NONE : groups.map((group) => `${group.deviceName}: ${PortRanges.compress(group.portIds)}`).join('; ')
}

/**
 * Turns a HandoverDocument into the printable page: sections of tables, fact lists, bullet lists and
 * paragraphs. The page renderer (D2) and the Markdown export draw the same layout.
 */
export class HandoverLayout {
  page(document: HandoverDocument): HandoverPage {
    const { meta } = document
    const facts: HandoverPage['meta'] = []
    if (meta.author) facts.push({ label: localizedMessage('design:handover.meta.author'), value: meta.author })
    facts.push({ label: localizedMessage('design:handover.meta.updated'), value: meta.updatedAt.slice(0, 10) })
    if (meta.briefId !== undefined) facts.push({ label: localizedMessage('design:handover.meta.brief'), value: { key: `designBriefs:${meta.briefId}.title` } })
    if (meta.description) facts.push({ label: localizedMessage('design:handover.meta.description'), value: meta.description })
    return {
      heading: localizedMessage('design:handover.title'),
      title: meta.title.trim() === '' ? localizedMessage('design:handover.untitled') : meta.title,
      meta: facts,
      sections: [
        this.section('summary', this.summary(document)),
        this.section('ipPlan', this.ipPlan(document)),
        this.section('vlans', this.vlans(document)),
        this.section('devices', this.devices(document)),
        this.section('cabling', this.cabling(document)),
        this.section('configs', this.configs(document)),
        this.section('issues', this.issues(document.issues)),
      ],
    }
  }

  private section(id: HandoverSectionId, blocks: HandoverBlock[]): HandoverSection {
    const title = localizedMessage(`design:handover.sections.${id}`)
    return { id, title, blocks: blocks.length > 0 ? blocks : [{ type: 'paragraph', text: localizedMessage(`design:handover.empty.${id}`) }] }
  }

  private summary(document: HandoverDocument): HandoverBlock[] {
    const { summary } = document
    if (summary.devices === 0) return []
    const items: Array<{ label: HandoverText; value: HandoverText }> = [
      { label: localizedMessage('design:handover.summary.devices'), value: String(summary.devices) },
      { label: localizedMessage('design:handover.summary.devicesOff'), value: String(summary.devicesOff) },
      { label: localizedMessage('design:handover.summary.links'), value: String(summary.links) },
      { label: localizedMessage('design:handover.summary.unpluggedLinks'), value: String(summary.unpluggedLinks) },
      { label: localizedMessage('design:handover.summary.subnets'), value: String(summary.subnets) },
      { label: localizedMessage('design:handover.summary.vlans'), value: String(summary.vlans) },
    ]
    const brief = summary.brief
    if (brief) {
      items.push({ label: localizedMessage('design:handover.summary.requirements'), value: `${brief.passed} / ${brief.total}` })
      items.push({
        label: localizedMessage('design:handover.summary.cost'),
        value:
          brief.budget === undefined
            ? localizedMessage('design:handover.values.cost', { total: brief.cost })
            : localizedMessage('design:handover.values.costOfBudget', { total: brief.cost, budget: brief.budget }),
      })
    }
    const blocks: HandoverBlock[] = [{ type: 'facts', items }]
    blocks.push({ type: 'table', columns: [column('type'), column('count')], rows: summary.byKind.map((line) => [line.label, String(line.count)]) })
    if (summary.byCable.length > 0) {
      blocks.push({ type: 'table', columns: [column('cable'), column('count')], rows: summary.byCable.map((line) => [line.label, String(line.count)]) })
    }
    if (summary.zones.length > 0) {
      const names = new Map(document.devices.map((device) => [device.deviceId, device.deviceName]))
      const rows = summary.zones.map((zone): HandoverText[] => [zone.label, joined(zone.deviceIds.map((id) => names.get(id) ?? id))])
      blocks.push({ type: 'table', columns: [column('zone'), column('devices')], rows })
    }
    return blocks
  }

  private ipPlan(document: HandoverDocument): HandoverBlock[] {
    if (document.ipPlan.length === 0) return []
    const rows = document.ipPlan.map((subnet): HandoverText[] => [
      subnet.network,
      joined(subnet.vlans.map(String)),
      joined(subnet.gateways.map((gateway) => `${gateway.address} (${gateway.deviceName})`)),
      joined(subnet.dhcp.map((scope) => `${scope.start} – ${scope.end} (${scope.deviceName})`)),
      `${subnet.members.length} / ${subnet.usable}`,
    ])
    return [{ type: 'table', columns: [column('network'), column('vlan'), column('gateway'), column('dhcp'), column('hosts')], rows }]
  }

  private vlans(document: HandoverDocument): HandoverBlock[] {
    if (document.vlans.length === 0) return []
    const rows = document.vlans.map((row): HandoverText[] => [
      String(row.vlan),
      joined(row.names),
      joined(row.subnets),
      portsCell(row.accessPorts),
      portsCell(row.trunkPorts),
      joined(row.interfaces.map((entry) => `${entry.address} (${entry.deviceName} ${entry.interfaceId})`)),
      joined(row.ssids.map((entry) => `${entry.ssid} (${entry.deviceName})`)),
    ])
    const columns = [column('vlan'), column('name'), column('subnets'), column('accessPorts'), column('trunkPorts'), column('interfaces'), column('ssids')]
    return [{ type: 'table', columns, rows }]
  }

  private devices(document: HandoverDocument): HandoverBlock[] {
    if (document.devices.length === 0) return []
    const withZones = document.devices.some((device) => device.zone !== undefined)
    const withOrigin = document.devices.some((device) => device.provided !== undefined)
    const columns = [column('device'), column('type'), column('model'), column('managementIp')]
    if (withZones) columns.push(column('zone'))
    columns.push(column('ports'), column('state'))
    if (withOrigin) columns.push(column('origin'))
    const rows = document.devices.map((device) => {
      const row: HandoverText[] = [device.deviceName, device.kindLabel, device.model, device.managementIp ?? NONE]
      if (withZones) row.push(device.zone ?? NONE)
      row.push(`${device.ports.used} / ${device.ports.total}`, localizedMessage(device.powered ? 'design:handover.values.on' : 'design:handover.values.off'))
      if (withOrigin) row.push(device.provided === undefined ? NONE : localizedMessage(device.provided ? 'design:handover.values.provided' : 'design:handover.values.added'))
      return row
    })
    return [{ type: 'table', columns, rows }]
  }

  private cabling(document: HandoverDocument): HandoverBlock[] {
    if (document.cabling.length === 0) return []
    const rows = document.cabling.map((row): HandoverText[] => [
      row.from.deviceName,
      row.from.portId,
      row.from.mode ?? NONE,
      row.to.deviceName,
      row.ssid === undefined ? row.to.portId : `${row.to.portId} (${row.ssid})`,
      row.cableLabel,
      localizedMessage(row.connected ? 'design:handover.values.plugged' : 'design:handover.values.unplugged'),
    ])
    const columns = [column('device'), column('port'), column('portMode'), column('connectedTo'), column('farPort'), column('cable'), column('state')]
    return [{ type: 'table', columns, rows }]
  }

  private configs(document: HandoverDocument): HandoverBlock[] {
    return document.configs.map((config) => ({ type: 'facts', caption: config.deviceName, items: config.items.map((item) => ({ label: item.label, value: item.value })) }))
  }

  private issues(issues: readonly OpenIssue[]): HandoverBlock[] {
    const requirementLines: HandoverLine[] = []
    const labLines: HandoverLine[] = []
    for (const issue of issues) {
      if (issue.source === 'lab') {
        labLines.push([issue.message])
        continue
      }
      const line: HandoverLine = [issue.message]
      if (issue.qualifier) line.push(issue.qualifier)
      if (issue.hidden) line.push(localizedMessage('design:review.notes.hidden'))
      requirementLines.push(line)
    }
    const blocks: HandoverBlock[] = []
    if (requirementLines.length > 0) blocks.push({ type: 'list', caption: localizedMessage('design:handover.issues.requirements'), items: requirementLines })
    if (labLines.length > 0) blocks.push({ type: 'list', caption: localizedMessage('design:handover.issues.lab'), items: labLines })
    return blocks
  }
}
