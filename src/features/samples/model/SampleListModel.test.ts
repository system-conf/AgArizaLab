import { describe, expect, it } from 'vitest'
import { SampleCatalog, SampleProgressBook, type SampleDefinition } from '../../../samples'
import { officeSample } from '../../../samples/contract/testSamples'
import { EMPTY_SAMPLE_FILTER, SampleListModel, type SampleListTexts } from './SampleListModel'

const NOW = new Date('2026-11-06T10:00:00Z')

const titles: Readonly<Record<string, string>> = {
  officeBasics: 'Office basics',
  dhcpRouter: 'Router as DHCP server',
  arpSteps: 'ARP step by step',
  cliFirst: 'First switch config',
}

const texts: SampleListTexts = {
  title: (id) => titles[id] ?? id,
  summary: (id) => `Summary of ${id}`,
  topics: (id) => (id === 'dhcpRouter' ? ['DHCP', 'Adres havuzu'] : []),
  categoryTitle: (category) => `Category ${category}`,
  level: (level) => `Level ${level}`,
  feature: (feature) => `Feature ${feature}`,
}

const samples: SampleDefinition[] = [
  officeSample({ id: 'dhcpRouter', category: 'dhcp', order: 1, level: 'intermediate' }),
  officeSample(),
  officeSample({ id: 'arpSteps', category: 'packetView', order: 1, level: 'beginner', features: ['simulation'] }),
  officeSample({ id: 'cliFirst', category: 'deviceCli', order: 1, features: ['deviceCli'] }),
]

function model(book = SampleProgressBook.empty()): SampleListModel {
  return SampleListModel.from(new SampleCatalog(samples, { simulation: true, dhcpRelay: true, dnsForwarding: true, deviceCli: false }), texts, book)
}

describe('SampleListModel', () => {
  it('groups available samples by category in catalogue order with their texts', () => {
    const list = model()
    expect(list.groups.map((group) => [group.category, group.items.map((item) => item.id)])).toEqual([
      ['basics', ['officeBasics']],
      ['dhcp', ['dhcpRouter']],
      ['packetView', ['arpSteps']],
    ])
    expect(list.items[1]).toMatchObject({ title: 'Router as DHCP server', level: 'intermediate', topics: ['DHCP', 'Adres havuzu'] })
  })

  it('offers chips only for the levels and features the samples have', () => {
    expect(model().levels()).toEqual(['beginner', 'intermediate'])
    expect(model().features()).toEqual(['simulation'])
  })

  it('counts progress per sample and finished samples', () => {
    const sample = officeSample()
    const book = SampleProgressBook.empty().withStepsDone(
      sample,
      sample.steps.map((step) => step.id),
      NOW,
    )
    const list = model(book.withStepsDone(officeSample({ id: 'arpSteps' }), ['watchArp'], NOW))
    expect(list.items.map((item) => item.completion)).toEqual([
      { done: 4, total: 4, complete: true },
      { done: 0, total: 4, complete: false },
      { done: 1, total: 4, complete: false },
    ])
    expect(list.completion()).toEqual({ complete: 1, total: 3 })
  })

  it('filters by search text in titles, topics, levels and features (Turkish insensitive)', () => {
    const ids = (query: string) =>
      model()
        .filtered({ ...EMPTY_SAMPLE_FILTER, query }, 'tr')
        .flatMap((group) => group.items.map((item) => item.id))
    expect(ids('')).toEqual(['officeBasics', 'dhcpRouter', 'arpSteps'])
    expect(ids('HAVUZ')).toEqual(['dhcpRouter'])
    expect(ids('arp step')).toEqual(['arpSteps'])
    expect(ids('feature simulation')).toEqual(['arpSteps'])
    expect(ids('nothing here')).toEqual([])
  })

  it('filters by level and feature chips and drops empty groups', () => {
    const list = model()
    const levelOnly = list.filtered({ ...EMPTY_SAMPLE_FILTER, levels: ['intermediate'] }, 'en')
    expect(levelOnly.map((group) => group.category)).toEqual(['dhcp'])
    const feature = list.filtered({ ...EMPTY_SAMPLE_FILTER, features: ['simulation'] }, 'en')
    expect(feature.flatMap((group) => group.items.map((item) => item.id))).toEqual(['arpSteps'])
    const both = list.filtered({ query: '', levels: ['beginner'], features: ['simulation'] }, 'en')
    expect(both.flatMap((group) => group.items.map((item) => item.id))).toEqual(['arpSteps'])
  })

  it('toggles chips and knows when a filter is set', () => {
    expect(SampleListModel.toggle(['beginner'], 'advanced')).toEqual(['beginner', 'advanced'])
    expect(SampleListModel.toggle(['beginner', 'advanced'], 'beginner')).toEqual(['advanced'])
    expect(SampleListModel.isFiltered(EMPTY_SAMPLE_FILTER)).toBe(false)
    expect(SampleListModel.isFiltered({ ...EMPTY_SAMPLE_FILTER, query: '  ' })).toBe(false)
    expect(SampleListModel.isFiltered({ ...EMPTY_SAMPLE_FILTER, features: ['simulation'] })).toBe(true)
  })
})
