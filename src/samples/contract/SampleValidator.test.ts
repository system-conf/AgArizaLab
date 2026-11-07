import { describe, expect, it } from 'vitest'
import { officeLab } from '../../engine/testNetworks'
import type { SampleLab } from './SampleTypes'
import { SampleValidator } from './SampleValidator'
import { officeSample, rowLayout } from './testSamples'

const validator = new SampleValidator()

function codes(issues: readonly { code: string }[]): string[] {
  return issues.map((issue) => issue.code)
}

describe('SampleValidator', () => {
  it('accepts a valid sample', () => {
    expect(validator.validate(officeSample())).toEqual([])
  })

  it('requires 3 to 5 steps and at least one break-it idea', () => {
    const sample = officeSample()
    expect(codes(validator.validate(officeSample({ steps: sample.steps.slice(0, 2), breakIt: [] })))).toEqual(['stepCount', 'noBreakIt'])
    const six = [0, 1, 2, 3, 4, 5].map((index) => ({ id: `step${index}` }))
    expect(codes(validator.validate(officeSample({ steps: six })))).toEqual(['stepCount'])
  })

  it('finds non-camelCase and duplicate ids', () => {
    const issues = validator.validate(officeSample({
      id: 'Bad-id',
      steps: [{ id: 'one' }, { id: 'one' }, { id: 'two' }],
      breakIt: ['idea', 'idea'],
    }))
    expect(codes(issues)).toEqual(['badId', 'duplicateStepId', 'duplicateBreakItId'])
  })

  it('finds checks, groups and focus devices that name devices missing from the lab', () => {
    const issues = validator.validate(officeSample({
      groups: [{ id: 'pcs', name: 'pcs', deviceIds: ['pc1', 'pc9'] }],
      steps: [
        { id: 'one', focusDeviceId: 'ghost', checks: [{ type: 'not', check: { type: 'hasAddress', deviceId: 'pc7' } }] },
        { id: 'two', checks: [{ type: 'network', condition: { type: 'internet', group: 'nobody' } }] },
        { id: 'three', checks: [{ type: 'solve', condition: { type: 'resolves', fromDeviceId: 'pc8', name: 'example.com' } }] },
      ],
    }))
    const unknown = issues.filter((issue) => issue.code === 'unknownDevice').map((issue) => issue.detail)
    expect(unknown.sort()).toEqual(['ghost', 'nobody', 'pc7', 'pc8', 'pc9'])
  })

  it('requires nativeVlanMatch cables that exist and join two switchports', () => {
    const sample = officeSample()
    const issues = validator.validate(officeSample({
      steps: [
        ...sample.steps.slice(0, 3),
        { id: 'native', checks: [{ type: 'nativeVlanMatch', linkId: 'ghostLink' }, { type: 'not', check: { type: 'nativeVlanMatch', linkId: 'pc1Link' } }] },
      ],
    }))
    expect(issues).toEqual([
      { code: 'unknownLink', sampleId: 'officeBasics', stepId: 'native', detail: 'ghostLink' },
      { code: 'notSwitchLink', sampleId: 'officeBasics', stepId: 'native', detail: 'pc1Link' },
    ])
  })

  it('finds invalid CIDR prefixes', () => {
    const sample = officeSample()
    const issues = validator.validate(officeSample({
      steps: [...sample.steps.slice(0, 3), { id: 'bad', checks: [{ type: 'hasAddress', deviceId: 'pc1', prefix: '192.168.1.1/24' }] }],
    }))
    expect(issues).toEqual([{ code: 'badPrefix', sampleId: 'officeBasics', stepId: 'bad', detail: '192.168.1.1/24' }])
  })

  it('requires a fresh lab per call and a position for every device', () => {
    const state = officeLab()
    const devices = { ...rowLayout(state).devices }
    delete devices.printer
    const shared: SampleLab = { state, layout: { devices } }
    expect(codes(validator.validate(officeSample({ lab: () => shared })))).toEqual(['sharedLab', 'missingPosition'])
  })

  it('reports invariant violations of the lab', () => {
    const issues = validator.validate(officeSample({
      lab: () => {
        const state = officeLab()
        return { state: { ...state, links: [...state.links, ...state.links.slice(0, 1)] }, layout: rowLayout(state) }
      },
    }))
    expect(issues.some((issue) => issue.code === 'invalidLab' && issue.detail === 'duplicateLinkId')).toBe(true)
  })

  it('checks related links against the known ids', () => {
    const strict = new SampleValidator({ exerciseIds: ['posGateway'], briefIds: ['restaurant'], sampleIds: ['dhcpBasics'] })
    const ok = officeSample({
      related: [
        { kind: 'exercise', exerciseId: 'posGateway' },
        { kind: 'design', briefId: 'restaurant' },
        { kind: 'sample', sampleId: 'dhcpBasics' },
      ],
    })
    expect(strict.validate(ok)).toEqual([])
    const bad = officeSample({ related: [{ kind: 'exercise', exerciseId: 'nope' }, { kind: 'sample', sampleId: 'officeBasics' }] })
    expect(codes(strict.validate(bad))).toEqual(['badRelated', 'badRelated'])
  })

  it('validateAll finds duplicate sample ids and duplicate orders in a category', () => {
    const issues = validator.validateAll([officeSample(), officeSample(), officeSample({ id: 'other', category: 'dhcp' })])
    expect(codes(issues)).toEqual(['duplicateSampleId', 'duplicateOrder'])
  })

  it('validateAll checks sample links against the given samples', () => {
    const issues = validator.validateAll([officeSample({ related: [{ kind: 'sample', sampleId: 'missing' }] })])
    expect(codes(issues)).toEqual(['badRelated'])
  })
})
