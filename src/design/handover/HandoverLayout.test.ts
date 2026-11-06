import { describe, expect, it } from 'vitest'
import type { LabDocument } from '../../domain'
import type { LocalizedMessage } from '../../domain/Messages'
import { officeBrief } from '../testBriefs'
import { HandoverPack } from './HandoverPack'
import type { HandoverBlock } from './HandoverTypes'
import { PortRanges } from './PortRanges'

/** Test translator: the key, with the params as JSON. */
function keys(message: LocalizedMessage): string {
  return message.params ? `${message.key}${JSON.stringify(message.params)}` : message.key
}

const META: LabDocument['meta'] = { title: 'Office | HQ', createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-06T12:30:00.000Z' }

function table(blocks: readonly HandoverBlock[]): Extract<HandoverBlock, { type: 'table' }> {
  const found = blocks.find((block): block is Extract<HandoverBlock, { type: 'table' }> => block.type === 'table')
  if (!found) throw new Error('No table')
  return found
}

describe('HandoverLayout', () => {
  const brief = officeBrief()
  const doc = { meta: META, state: brief.reference.state, layout: brief.reference.layout, annotations: [] }
  const document = HandoverPack.build(doc, { brief })
  const page = HandoverPack.page(document)

  it('lays out the meta facts and every section in order', () => {
    expect(page.heading).toEqual({ key: 'design:handover.title' })
    expect(page.title).toBe('Office | HQ')
    expect(page.meta).toEqual([
      { label: { key: 'design:handover.meta.updated' }, value: '2026-11-06' },
      { label: { key: 'design:handover.meta.brief' }, value: { key: 'designBriefs:testOffice.title' } },
    ])
    expect(page.sections.map((section) => [section.id, section.title.key])).toEqual([
      ['summary', 'design:handover.sections.summary'],
      ['ipPlan', 'design:handover.sections.ipPlan'],
      ['vlans', 'design:handover.sections.vlans'],
      ['devices', 'design:handover.sections.devices'],
      ['cabling', 'design:handover.sections.cabling'],
      ['configs', 'design:handover.sections.configs'],
      ['issues', 'design:handover.sections.issues'],
    ])
  })

  it('builds the IP plan and device tables', () => {
    const ipPlan = table(page.sections[1]?.blocks ?? [])
    expect(ipPlan.columns.map((column) => column.key)).toEqual([
      'design:handover.columns.network',
      'design:handover.columns.vlan',
      'design:handover.columns.gateway',
      'design:handover.columns.dhcp',
      'design:handover.columns.hosts',
    ])
    expect(ipPlan.rows).toEqual([['192.168.10.0/24', '1', '192.168.10.1 (router)', '192.168.10.100 – 192.168.10.200 (router)', '5 / 254']])
    const devices = table(page.sections[3]?.blocks ?? [])
    // No zones in this lab: no zone column; built for a brief: an origin column.
    expect(devices.columns.map((column) => column.key)).not.toContain('design:handover.columns.zone')
    expect(devices.columns.at(-1)?.key).toBe('design:handover.columns.origin')
    expect(devices.rows[5]).toEqual([
      'router',
      { key: 'catalog:kinds.router' },
      { key: 'catalog:models.router2Port.name' },
      '192.168.10.1/24',
      '2 / 3',
      { key: 'design:handover.values.on' },
      { key: 'design:handover.values.added' },
    ])
  })

  it('says so when a section is empty', () => {
    const empty = HandoverPack.page(HandoverPack.build({ meta: { ...META, title: ' ' }, state: { devices: [], links: [] }, layout: { devices: {} }, annotations: [] }))
    expect(empty.title).toEqual({ key: 'design:handover.untitled' })
    expect(empty.sections.map((section) => section.blocks)).toEqual(
      ['summary', 'ipPlan', 'vlans', 'devices', 'cabling', 'configs', 'issues'].map((id) => [{ type: 'paragraph', text: { key: `design:handover.empty.${id}` } }]),
    )
  })

  it('groups open issues into requirement and lab lists', () => {
    const start = HandoverPack.page(HandoverPack.build({ ...doc, state: brief.lab.state }, { brief }))
    const issues = start.sections[6]?.blocks ?? []
    expect(issues.map((block) => block.type === 'list' && block.caption)).toEqual([
      { key: 'design:handover.issues.requirements' },
      { key: 'design:handover.issues.lab' },
    ])
    const requirements = issues[0]
    expect(requirements?.type === 'list' && requirements.items.at(-1)).toEqual([
      { key: 'design:requirements.internet', params: { group: 'Printer' } },
      { key: 'design:review.notes.hidden' },
    ])
  })
})

describe('HandoverPack.toMarkdown', () => {
  const brief = officeBrief()
  const document = HandoverPack.build({ meta: META, state: brief.reference.state, layout: brief.reference.layout, annotations: [] }, { brief })
  const markdown = HandoverPack.toMarkdown(document, keys)

  it('writes headings, facts and pipe tables with translated texts', () => {
    expect(markdown.startsWith('# design:handover.title: Office | HQ\n')).toBe(true)
    expect(markdown).toContain('- **design:handover.meta.updated:** 2026-11-06')
    expect(markdown).toContain('## design:handover.sections.ipPlan')
    expect(markdown).toContain(
      '| design:handover.columns.network | design:handover.columns.vlan | design:handover.columns.gateway | design:handover.columns.dhcp | design:handover.columns.hosts |\n| --- | --- | --- | --- | --- |\n| 192.168.10.0/24 | 1 | 192.168.10.1 (router) | 192.168.10.100 – 192.168.10.200 (router) | 5 / 254 |',
    )
    expect(markdown).toContain('### router\n\n- **design:handover.config.interface{"interface":"Gi0/0"}:** 192.168.10.1/24')
    expect(markdown).toContain('## design:handover.sections.issues\n\ndesign:handover.empty.issues\n')
    expect(markdown.endsWith('\n')).toBe(true)
  })

  it('escapes pipes in table cells and Markdown characters in user content', () => {
    const renamed = { ...brief.reference.state, devices: brief.reference.state.devices.map((device) => (device.id === 'pc1' ? { ...device, name: 'PC|1 *boss*' } : device)) }
    const text = HandoverPack.toMarkdown(HandoverPack.build({ meta: META, state: renamed, layout: brief.reference.layout, annotations: [] }), keys)
    expect(text).toContain('| PC\\|1 \\*boss\\* |')
    expect(text).toContain('### PC|1 \\*boss\\*')
  })
})

describe('PortRanges', () => {
  it('compresses consecutive ports of one stem', () => {
    expect(PortRanges.compress(['Fa0/3', 'Fa0/1', 'Fa0/2', 'Fa0/10', 'Gi0/1', 'Gi0/2', 'Fa0/12', 'eth0', 'Console'])).toBe('Console, eth0, Fa0/1–Fa0/3, Fa0/10, Fa0/12, Gi0/1–Gi0/2')
    expect(PortRanges.compress([])).toBe('')
    expect(PortRanges.compress(['Gi0/0.10', 'Gi0/0.20'])).toBe('Gi0/0.10, Gi0/0.20')
  })
})
