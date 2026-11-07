import { describe, expect, it } from 'vitest'
import { editHost, editSwitchport } from '../../engine/testLabs'
import { officeLab, unplug, vlanLab, wanDown } from '../../engine/testNetworks'
import type { SampleStep, StepCheck } from './SampleTypes'
import { referencedGroupIds, StepChecker } from './StepChecker'
import { officeSample, withoutDevice } from './testSamples'

const sample = officeSample()
const checker = new StepChecker(sample)
const pingPrinter: StepCheck = { type: 'solve', condition: { type: 'reachable', fromDeviceId: 'pc1', toDeviceId: 'printer' } }

function step(id: string, checks: StepCheck[]): SampleStep {
  return { id, checks }
}

describe('StepChecker', () => {
  it('reports a step without checks as manual', () => {
    expect(checker.check(officeLab())[1]).toEqual({ stepId: 'watchArp', kind: 'manual' })
    expect(checker.checkStep(officeLab(), step('empty', []))).toEqual({ stepId: 'empty', kind: 'manual' })
  })

  it('passes every automatic step on the working lab, in step order', () => {
    const statuses = checker.check(officeLab())
    expect(statuses.map((status) => status.stepId)).toEqual(['pingPrinter', 'watchArp', 'pcsOnline', 'printerInPlan'])
    expect(statuses.filter((status) => status.kind === 'auto').every((status) => status.ok)).toBe(true)
  })

  it('fails a solve check when the cable is unplugged', () => {
    const status = checker.checkStep(unplug(officeLab(), 'printerLink'), step('ping', [pingPrinter]))
    expect(status).toMatchObject({ kind: 'auto', ok: false })
  })

  it('fails a network check on a declared group when the internet is down', () => {
    const [, , online] = checker.check(wanDown(officeLab()))
    expect(online).toMatchObject({ stepId: 'pcsOnline', kind: 'auto', ok: false })
  })

  it('reports every check of a step separately', () => {
    const state = editHost(officeLab(), 'pc1', { defaultGateway: '' })
    const status = checker.checkStep(state, step('mixed', [
      { type: 'hasAddress', deviceId: 'pc1' },
      { type: 'solve', condition: { type: 'internet', fromDeviceId: 'pc1' } },
    ]))
    expect(status.kind === 'auto' ? status.checks.map((result) => result.ok) : null).toEqual([true, false])
    expect(status).toMatchObject({ ok: false })
  })

  it('treats an undeclared group id as the device with that id', () => {
    const groups = StepChecker.groupsOf(sample)
    expect(groups.map((group) => group.id)).toEqual(['pcs', 'printer'])
    expect(groups.find((group) => group.id === 'printer')?.deviceIds).toEqual(['printer'])
  })

  it('checks hasAddress with and without a prefix', () => {
    const state = officeLab()
    expect(checker.holds(state, { type: 'hasAddress', deviceId: 'printer' })).toBe(true)
    expect(checker.holds(state, { type: 'hasAddress', deviceId: 'printer', prefix: '169.254.0.0/16' })).toBe(false)
    expect(checker.holds(state, { type: 'hasAddress', deviceId: 'printer', prefix: 'not a prefix' })).toBe(false)
    expect(checker.holds(state, { type: 'hasAddress', deviceId: 'switch' })).toBe(false)
  })

  it('checks nativeVlanMatch on the two trunk ends of a cable', () => {
    const match: StepCheck = { type: 'nativeVlanMatch', linkId: 'apLink' }
    const state = vlanLab()
    expect(checker.holds(state, match)).toBe(true)
    expect(checker.holds(state, { ...match, vlan: 1 })).toBe(true)
    expect(checker.holds(state, { ...match, vlan: 99 })).toBe(false)
    const mismatch = editSwitchport(state, 'switch', 'Fa0/4', { nativeVlan: 99 })
    expect(checker.holds(mismatch, match)).toBe(false)
    expect(checker.holds(editSwitchport(mismatch, 'ap', 'Gi0', { nativeVlan: 99 }), { ...match, vlan: 99 })).toBe(true)
    // An access port at one end is no trunk, even with a matching native VLAN setting.
    expect(checker.holds(editSwitchport(state, 'switch', 'Fa0/4', { mode: 'access' }), match)).toBe(false)
    // Unknown cable, a cable to a host NIC, a deleted device: false, never a throw.
    expect(checker.holds(state, { type: 'nativeVlanMatch', linkId: 'nope' })).toBe(false)
    expect(checker.holds(state, { type: 'nativeVlanMatch', linkId: 'guestLink' })).toBe(false)
    expect(checker.holds(withoutDevice(state, 'ap'), match)).toBe(false)
  })

  it('negates a check with not', () => {
    expect(checker.holds(officeLab(), { type: 'not', check: pingPrinter })).toBe(false)
    expect(checker.holds(unplug(officeLab(), 'printerLink'), { type: 'not', check: pingPrinter })).toBe(true)
  })

  it('fails (never throws) when a checked device was deleted', () => {
    const state = withoutDevice(officeLab(), 'printer')
    const statuses = checker.check(state)
    expect(statuses[0]).toMatchObject({ stepId: 'pingPrinter', ok: false })
    expect(statuses[3]).toMatchObject({ stepId: 'printerInPlan', ok: false })
    expect(checker.holds(state, { type: 'hasAddress', deviceId: 'printer' })).toBe(false)
  })

  it('does not mutate the state', () => {
    const state = officeLab()
    const before = JSON.stringify(state)
    checker.check(state)
    expect(JSON.stringify(state)).toBe(before)
  })

  it('collects group ids of network checks, also inside not', () => {
    const steps = [
      step('a', [{ type: 'not', check: { type: 'network', condition: { type: 'reachable', fromGroup: 'pc1', toGroup: 'printer' } } }]),
      step('b', [{ type: 'network', condition: { type: 'sameVlan', group: 'pc1' } }]),
    ]
    expect(referencedGroupIds(steps)).toEqual(['pc1', 'printer'])
  })
})
