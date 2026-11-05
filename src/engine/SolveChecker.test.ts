import { describe, expect, it } from 'vitest'
import type { SolveCondition } from '../domain/ScenarioTypes'
import { DefaultNetworkEngine } from './DefaultNetworkEngine'
import { SolveChecker } from './SolveChecker'
import { officeNetwork, updateDevice, updateHost, updatePort, vlanNetwork } from './testFixtures'

const checker = new SolveChecker(new DefaultNetworkEngine())

describe('SolveChecker', () => {
  it('evaluates every condition type on a working network', () => {
    const conditions: SolveCondition[] = [
      { type: 'internet', fromDeviceId: 'pc1' },
      { type: 'resolves', fromDeviceId: 'pc1', name: 'google.com' },
      { type: 'reachable', fromDeviceId: 'pc1', toDeviceId: 'printer' },
      { type: 'appLinksOk', deviceId: 'pc1' },
    ]
    expect(checker.check(officeNetwork(), conditions)).toEqual(conditions.map((condition) => ({ condition, ok: true })))
  })

  it('reports each failing condition separately', () => {
    const broken = updateHost(updateHost(officeNetwork(), 'pc1', { dns: ['192.168.1.254'] }), 'printer', { ip: '192.168.1.153' })
    const results = checker.check(broken, [
      { type: 'internet', fromDeviceId: 'pc1' },
      { type: 'resolves', fromDeviceId: 'pc1', name: 'google.com' },
      { type: 'appLinksOk', deviceId: 'pc1' },
    ])
    expect(results.map((result) => result.ok)).toEqual([true, false, false])
  })

  it('treats a target without an address as unreachable', () => {
    const state = updateHost(officeNetwork(), 'printer', { ip: '' })
    expect(checker.check(state, [{ type: 'reachable', fromDeviceId: 'pc1', toDeviceId: 'printer' }])[0]?.ok).toBe(false)
  })

  it('checks the kitchen VLAN fix end to end', () => {
    const broken = updatePort(vlanNetwork(), 'switch', 'Fa0/3', { vlan: 20 })
    const conditions: SolveCondition[] = [
      { type: 'appLinksOk', deviceId: 'kasa' },
      { type: 'internet', fromDeviceId: 'phone' },
    ]
    expect(checker.check(broken, conditions).map((result) => result.ok)).toEqual([false, true])
    expect(checker.check(vlanNetwork(), conditions).map((result) => result.ok)).toEqual([true, true])
  })

  it('fails the internet condition when the WAN is down', () => {
    const state = updateDevice(officeNetwork(), 'router', (router) => ({ ...router, wanUp: false }))
    expect(checker.check(state, [{ type: 'internet', fromDeviceId: 'pc1' }])[0]?.ok).toBe(false)
  })
})
