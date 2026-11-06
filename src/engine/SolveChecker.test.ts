import { describe, expect, it } from 'vitest'
import type { SolveCondition } from '../domain'
import { DefaultNetworkEngine } from './DefaultNetworkEngine'
import { SolveChecker } from './SolveChecker'
import { editHost, editSwitchport } from './testLabs'
import { editNic, officeLab, vlanLab, wanDown } from './testNetworks'

const checker = new SolveChecker(new DefaultNetworkEngine())

describe('SolveChecker', () => {
  it('evaluates every condition type on a working network', () => {
    const conditions: SolveCondition[] = [
      { type: 'internet', fromDeviceId: 'pc1' },
      { type: 'resolves', fromDeviceId: 'pc1', name: 'google.com' },
      { type: 'reachable', fromDeviceId: 'pc1', toDeviceId: 'printer' },
      { type: 'appLinksOk', deviceId: 'pc1' },
    ]
    expect(checker.check(officeLab(), conditions)).toEqual(conditions.map((condition) => ({ condition, ok: true })))
  })

  it('reports each failing condition separately', () => {
    const broken = editNic(editHost(officeLab(), 'pc1', { dnsServers: ['192.168.1.254'] }), 'printer', { address: '192.168.1.153' })
    const results = checker.check(broken, [
      { type: 'internet', fromDeviceId: 'pc1' },
      { type: 'resolves', fromDeviceId: 'pc1', name: 'google.com' },
      { type: 'appLinksOk', deviceId: 'pc1' },
    ])
    expect(results.map((result) => result.ok)).toEqual([true, false, false])
  })

  it('treats a target without an address as unreachable', () => {
    const state = editNic(officeLab(), 'printer', { address: '' })
    expect(checker.check(state, [{ type: 'reachable', fromDeviceId: 'pc1', toDeviceId: 'printer' }])[0]?.ok).toBe(false)
  })

  it('checks the kitchen VLAN fix end to end', () => {
    const broken = editSwitchport(vlanLab(), 'switch', 'Fa0/3', { accessVlan: 20 })
    const conditions: SolveCondition[] = [
      { type: 'appLinksOk', deviceId: 'kasa' },
      { type: 'internet', fromDeviceId: 'phone' },
    ]
    expect(checker.check(broken, conditions).map((result) => result.ok)).toEqual([false, true])
    expect(checker.check(vlanLab(), conditions).map((result) => result.ok)).toEqual([true, true])
  })

  it('fails the internet condition when the WAN is down', () => {
    expect(checker.check(wanDown(officeLab()), [{ type: 'internet', fromDeviceId: 'pc1' }])[0]?.ok).toBe(false)
  })
})
