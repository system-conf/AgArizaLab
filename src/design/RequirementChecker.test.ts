import { describe, expect, it } from 'vitest'
import type { DesignRequirement, NetworkState } from '../domain'
import { networkEngine } from '../engine'
import { RequirementChecker } from './RequirementChecker'
import { editDevice, officeBrief, OFFICE_LIMIT_IDS } from './testBriefs'

function resultsById(checker: RequirementChecker, state: NetworkState) {
  return new Map(checker.check(state).map((result) => [result.requirement.id, result]))
}

function okOf(checker: RequirementChecker, state: NetworkState, id: string): boolean | undefined {
  return resultsById(checker, state).get(id)?.ok
}

describe('RequirementChecker on the office brief', () => {
  const brief = officeBrief()
  const checker = new RequirementChecker(brief)

  it('fails every requirement on the starting lab except the limits', () => {
    const results = checker.check(brief.lab.state)
    expect(results.map((result) => result.requirement.id)).toEqual(brief.requirements.map((requirement) => requirement.id))
    for (const result of results) expect(result.ok, result.requirement.id).toBe(OFFICE_LIMIT_IDS.includes(result.requirement.id))
  })

  it('passes every requirement on the reference design', () => {
    for (const result of checker.check(brief.reference.state)) expect(result.ok, result.requirement.id).toBe(true)
  })

  it('never mutates the lab it checks', () => {
    const state = brief.reference.state
    const snapshot = JSON.stringify(state)
    checker.check(state)
    expect(JSON.stringify(state)).toBe(snapshot)
  })

  it('evaluates DHCP clients as if they had asked for an address', () => {
    // The reference PCs have no address in the lab itself; the checker settles DHCP on a copy.
    expect(networkEngine.reach(brief.reference.state, 'pc1', '8.8.8.8').ok).toBe(false)
    expect(okOf(checker, brief.reference.state, 'officeOnline')).toBe(true)
  })

  it('drops a stale address when no DHCP server answers', () => {
    const noDhcp = editDevice(brief.reference.state, 'router', (router) => ({ ...router, services: { ...router.services, dhcp: undefined } }))
    const results = resultsById(checker, noDhcp)
    expect(results.get('officeDhcp')?.ok).toBe(false)
    expect(results.get('officeOnline')?.ok).toBe(false)
    expect(results.get('printerOnline')?.ok).toBe(true)
  })

  it('reports measures for the checklist', () => {
    const results = resultsById(checker, brief.reference.state)
    expect(results.get('printing')?.measure).toEqual({ unit: 'pairs', value: 3, limit: 3 })
    expect(results.get('officeOnline')?.measure).toEqual({ unit: 'members', value: 3, limit: 3 })
    expect(results.get('budget')?.measure).toEqual({ unit: 'cost', value: 860, limit: 1000 })
    expect(results.get('oneRouter')?.measure).toEqual({ unit: 'devices', value: 1, limit: 1 })
  })

  it('describes requirements with group names, never with the solution', () => {
    const results = resultsById(checker, brief.lab.state)
    expect(results.get('printing')?.description).toEqual({ key: 'design:requirements.reachable', params: { from: 'Office PCs', to: 'Printer' } })
    expect(results.get('printingOffline')?.qualifier).toEqual({ key: 'design:failures.device', params: { device: 'isp' } })
    expect(results.get('hasRouter')?.description).toEqual({ key: 'design:requirements.uses.routing' })
    expect(results.get('oneRouter')?.description).toEqual({ key: 'design:requirements.maxDevices.router', params: { count: 1 } })
    expect(results.get('budget')?.description).toEqual({ key: 'design:requirements.maxCost', params: { amount: 1000 } })
  })

  it('fails a missing customer device', () => {
    const withoutPc = { ...brief.reference.state, devices: brief.reference.state.devices.filter((device) => device.id !== 'pc3') }
    expect(okOf(checker, withoutPc, 'officeOnline')).toBe(false)
    expect(okOf(checker, withoutPc, 'printing')).toBe(false)
  })

  it('grades the limits by what the learner added', () => {
    const tight: DesignRequirement[] = [
      { id: 'budget', condition: { type: 'maxCost', amount: 859 } },
      { id: 'devices', condition: { type: 'maxDevices', count: 1 } },
    ]
    const results = new RequirementChecker({ ...brief, requirements: tight }).check(brief.reference.state)
    expect(results.map((result) => result.ok)).toEqual([false, false])
  })

  it('needs the address plan and one segment', () => {
    const outside = editDevice(brief.reference.state, 'printer', (printer) => ({
      ...printer,
      ports: printer.ports.map((port) => (port.role === 'host' ? { ...port, l3: { ipv4: { addressing: 'static', address: '192.168.11.50', mask: '255.255.255.0' } } } : port)),
    }))
    expect(okOf(checker, outside, 'plan')).toBe(false)
    const unplugged = { ...brief.reference.state, links: brief.reference.state.links.filter((link) => link.id !== 'printerLink') }
    expect(okOf(checker, unplugged, 'oneSegment')).toBe(false)
  })

  it('fails survivesFailure when the requirement depends on the failed device', () => {
    const viaIsp: DesignRequirement = {
      id: 'onlineWithoutIsp',
      condition: { type: 'survivesFailure', failure: { scope: 'device', deviceId: 'isp' }, requirement: { type: 'internet', group: 'office' } },
    }
    const [result] = new RequirementChecker({ ...brief, requirements: [viaIsp] }).check(brief.reference.state)
    expect(result).toMatchObject({ ok: false, brokenBy: 'isp' })
  })

  it('counts a capability only on a powered, connected device', () => {
    const routerOff = editDevice(brief.reference.state, 'router', (router) => ({ ...router, powered: false }))
    expect(okOf(checker, routerOff, 'hasRouter')).toBe(false)
  })
})
