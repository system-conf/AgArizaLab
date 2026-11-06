import { describe, expect, it } from 'vitest'
import { SampleCatalog, openSampleLab } from './SampleCatalog'
import { SAMPLE_CATEGORIES } from './sampleCatalogue'
import { SampleTextKeys } from './SampleTextKeys'
import { SampleTextReader } from './SampleTextReader'
import { officeSample } from './testSamples'

const basicsOne = officeSample({ id: 'basicsOne', order: 2 })
const basicsTwo = officeSample({ id: 'basicsTwo', order: 1 })
const dhcpOne = officeSample({ id: 'dhcpOne', category: 'dhcp', order: 1, features: ['simulation'] })
const cliOne = officeSample({ id: 'cliOne', category: 'deviceCli', order: 1, features: ['deviceCli'] })
const availability = { simulation: true, dhcpRelay: true, dnsForwarding: true, deviceCli: false }
const catalog = new SampleCatalog([dhcpOne, cliOne, basicsOne, basicsTwo], availability)

describe('SampleCatalog', () => {
  it('lists available samples grouped by category, in display order', () => {
    const groups = catalog.byCategory()
    expect(groups.map((group) => group.category.id)).toEqual(['basics', 'dhcp'])
    expect(groups[0]?.samples.map((sample) => sample.id)).toEqual(['basicsTwo', 'basicsOne'])
    expect(catalog.available().map((sample) => sample.id)).toEqual(['basicsTwo', 'basicsOne', 'dhcpOne'])
  })

  it('hides samples whose features are not available', () => {
    expect(catalog.isAvailable(cliOne)).toBe(false)
    expect(catalog.find('cliOne')).toBeUndefined()
    expect(catalog.find('dhcpOne')).toBe(dhcpOne)
    expect(catalog.find('unknown')).toBeUndefined()
  })

  it('has unique category ids covering the docs table', () => {
    const ids = SAMPLE_CATEGORIES.map((category) => category.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(16)
  })

  it('matches every query word case and accent insensitively', () => {
    const fields = ['İstemci IP çakışması', 'Temeller']
    expect(SampleCatalog.matches(fields, 'istemci', 'tr')).toBe(true)
    expect(SampleCatalog.matches(fields, 'CAKISMA temel', 'tr')).toBe(true)
    expect(SampleCatalog.matches(fields, 'dhcp', 'tr')).toBe(false)
    expect(SampleCatalog.matches(['Default gateway'], '  ', 'en')).toBe(true)
  })
})

describe('openSampleLab', () => {
  it('builds a fresh free lab with the given title and annotations', () => {
    const sample = officeSample({
      lab: () => ({ ...officeSample().lab(), annotations: [{ id: 'note', type: 'text', color: 'blue', at: { x: 0, y: 0 }, text: 'LAN', size: 'small' }] }),
    })
    const now = new Date('2026-11-06T10:00:00.000Z')
    const first = openSampleLab(sample, { title: 'Default gateway', now })
    const second = openSampleLab(sample, { now })
    expect(first.meta).toEqual({ title: 'Default gateway', createdAt: now.toISOString(), updatedAt: now.toISOString() })
    expect(first.annotations.map((annotation) => annotation.id)).toEqual(['note'])
    expect(first.state).not.toBe(second.state)
    expect(second.meta.title).toBe('')
    expect(openSampleLab(officeSample()).annotations).toEqual([])
  })
})

describe('sample texts', () => {
  const sample = officeSample()

  it('lists every string key of a sample', () => {
    const keys = SampleTextKeys.stringKeys(sample)
    expect(keys.slice(0, 5)).toEqual([
      'samples:labs.officeBasics.title',
      'samples:labs.officeBasics.summary',
      'samples:labs.officeBasics.intro.what',
      'samples:labs.officeBasics.intro.why',
      'samples:labs.officeBasics.intro.realWorld',
    ])
    expect(keys).toContain('samples:labs.officeBasics.steps.watchArp.detail')
    expect(keys).toContain('samples:labs.officeBasics.breakIt.wrongGateway.result')
    expect(keys).toHaveLength(5 + 4 * 2 + 2 * 2)
  })

  it('reads texts and falls back to ids for missing ones', () => {
    const dictionary: Record<string, unknown> = {
      [SampleTextKeys.title(sample.id)]: 'Office basics',
      [SampleTextKeys.step(sample.id, 'pingPrinter', 'title')]: 'Ping the printer',
      [SampleTextKeys.topics(sample.id)]: ['ARP', 'ICMP'],
    }
    const t = (key: string): unknown => dictionary[key] ?? key
    const warn = console.warn
    console.warn = () => undefined
    try {
      const texts = new SampleTextReader(t).texts(sample)
      expect(texts.title).toBe('Office basics')
      expect(texts.summary).toBe('')
      expect(texts.steps[0]).toEqual({ id: 'pingPrinter', title: 'Ping the printer', detail: '' })
      expect(texts.steps[1]?.title).toBe('watchArp')
      expect(texts.breakIt.map((idea) => idea.change)).toEqual(['unplugPrinter', 'wrongGateway'])
      expect(texts.topics).toEqual(['ARP', 'ICMP'])
    } finally {
      console.warn = warn
    }
  })
})
