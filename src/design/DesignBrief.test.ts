import { describe, expect, it } from 'vitest'
import type { DesignExerciseDefinition } from '../domain'
import { deviceCatalog } from '../catalog'
import { CatalogFilterPolicy } from './CatalogFilterPolicy'
import { Cidr } from './Cidr'
import { DesignBriefValidator } from './DesignBriefValidator'
import { PriceCatalog } from './PriceCatalog'
import { DEFAULT_PRICE_LIST } from './prices'
import { officeBrief } from './testBriefs'

const validator = new DesignBriefValidator()

describe('DesignBriefValidator', () => {
  it('accepts the test brief', () => {
    expect(validator.issues(officeBrief())).toEqual([])
  })

  it('reports broken references', () => {
    const brief = officeBrief()
    const broken: DesignExerciseDefinition = {
      ...brief,
      groups: [...brief.groups, { id: 'office', name: 'again', deviceIds: ['ghost'] }, { id: 'empty', name: 'empty', deviceIds: [] }],
      requirements: [
        ...brief.requirements,
        { id: 'officeOnline', condition: { type: 'internet', group: 'nobody' } },
        { id: 'plan2', condition: { type: 'addressPlan', group: 'office', prefix: '192.168.10.5/24' } },
        { id: 'fail', condition: { type: 'survivesFailure', failure: { scope: 'link', linkId: 'nope' }, requirement: { type: 'internet', group: 'office' } } },
        { id: 'count', condition: { type: 'maxDevices', count: -1 } },
      ],
      budget: 999,
      locks: [{ scope: 'topology' }],
      reviewHints: [{ id: 'hint', requirementId: 'missing' }],
      reference: { ...brief.reference, state: { ...brief.reference.state, devices: brief.reference.state.devices.filter((device) => device.id !== 'pc1') } },
      allowedModels: { modelIds: ['noSuchModel'] },
    }
    expect(validator.issues(broken)).toEqual([
      { code: 'duplicateGroup', subject: 'office' },
      { code: 'unknownMember', subject: 'ghost' },
      { code: 'emptyGroup', subject: 'empty' },
      { code: 'duplicateRequirement', subject: 'officeOnline' },
      { code: 'unknownGroup', subject: 'officeOnline' },
      { code: 'invalidPrefix', subject: 'plan2' },
      { code: 'unknownFailureTarget', subject: 'fail' },
      { code: 'invalidLimit', subject: 'count' },
      { code: 'budgetWithoutMaxCost', subject: 'testOffice' },
      { code: 'unknownHintRequirement', subject: 'hint' },
      { code: 'referenceMissingDevice', subject: 'pc1' },
      { code: 'topologyLocked', subject: 'testOffice' },
      ...['isp', 'pc1', 'pc2', 'pc3', 'printer'].map((subject) => ({ code: 'unpinnedDevice', subject })),
      { code: 'unknownModel', subject: 'noSuchModel' },
    ])
  })
})

describe('prices', () => {
  it('prices every catalog model (by id or by kind) and every cable', () => {
    const prices = PriceCatalog.default
    for (const model of deviceCatalog) expect(prices.priceOfModel(model.id, model.kind), model.id).toBeGreaterThanOrEqual(0)
    expect(prices.priceOfLink({ cable: 'wireless' })).toBe(0)
    expect(prices.priceOfLink({ cable: 'fiber' })).toBeGreaterThan(prices.priceOfLink({ cable: 'copperStraight' }))
  })

  it('falls back to the kind price for models without an entry', () => {
    expect(PriceCatalog.default.priceOfDevice({ modelId: 'futureRouter', kind: 'router' })).toBe(DEFAULT_PRICE_LIST.kinds.router)
  })

  it('keeps the price list sensible: bigger and PoE switches cost more', () => {
    const { models } = DEFAULT_PRICE_LIST
    expect(models.switch24).toBeGreaterThan(models.switch8 ?? Infinity)
    expect(models.switch24Poe).toBeGreaterThan(models.switch24 ?? Infinity)
  })
})

describe('CatalogFilterPolicy', () => {
  it('allows everything without a filter and listed categories or models with one', () => {
    expect(CatalogFilterPolicy.everything.allows({ id: 'pc', category: 'endDevices' })).toBe(true)
    const policy = new CatalogFilterPolicy(officeBrief().allowedModels)
    expect(policy.allows({ id: 'router2Port', category: 'routers' })).toBe(true)
    expect(policy.allows({ id: 'accessPoint', category: 'wireless' })).toBe(true)
    expect(policy.allows({ id: 'wirelessRouter', category: 'wireless' })).toBe(false)
  })
})

describe('Cidr', () => {
  it('parses network blocks only', () => {
    expect(Cidr.parse('192.168.10.0/24')).toEqual({ network: '192.168.10.0', mask: '255.255.255.0' })
    expect(Cidr.parse('0.0.0.0/0')).toEqual({ network: '0.0.0.0', mask: '0.0.0.0' })
    expect(Cidr.parse('192.168.10.1/24')).toBeNull()
    expect(Cidr.parse('192.168.10.0/33')).toBeNull()
    expect(Cidr.parse('192.168.10.0')).toBeNull()
  })

  it('detects overlapping blocks', () => {
    const wide = { network: '192.168.0.0', mask: '255.255.0.0' }
    const narrow = { network: '192.168.10.0', mask: '255.255.255.0' }
    expect(Cidr.overlaps(wide, narrow)).toBe(true)
    expect(Cidr.overlaps(narrow, { network: '192.168.20.0', mask: '255.255.255.0' })).toBe(false)
  })
})
