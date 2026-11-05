import { describe, expect, it } from 'vitest'
import { DefaultNetworkEngine } from './DefaultNetworkEngine'
import { networkEngine, solveChecker } from './index'
import { deepFreeze, deviceOf, officeNetwork, updateDevice, updateHost, vlanNetwork } from './testFixtures'

const engine = new DefaultNetworkEngine()

describe('DefaultNetworkEngine', () => {
  it('never mutates a deep-frozen input state', () => {
    const office = deepFreeze(updateHost(officeNetwork(), 'pc2', { ip: '', gateway: '', dns: [] }))
    // The Wi-Fi client becomes a PC so the commands really run (phones have no terminal).
    const vlans = deepFreeze(updateDevice(vlanNetwork(), 'phone', (device) => ({ ...device, kind: 'pc' })))
    const snapshot = JSON.stringify(office)

    expect(() => {
      engine.reach(office, 'pc1', '8.8.8.8')
      engine.reach(vlans, 'kasa', '192.168.20.50')
      engine.resolve(office, 'pc1', 'google.com')
      engine.appLinkStatus(office, 'pc1')
      engine.renewDhcp(office, 'pc2')
      for (const command of ['ipconfig', 'ipconfig /all', 'ipconfig /renew', 'ping google.com', 'nslookup google.com', 'help', 'xyz']) {
        engine.runCommand(office, 'pc2', command)
        engine.runCommand(vlans, 'phone', command)
      }
    }).not.toThrow()
    expect(JSON.stringify(office)).toBe(snapshot)
  })

  it('returns a fresh state from renewDhcp and leaves the old one intact', () => {
    const before = deepFreeze(updateHost(officeNetwork(), 'pc2', { ip: '', gateway: '', dns: [] }))
    const result = engine.renewDhcp(before, 'pc2')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(deviceOf(before, 'pc2').host?.ip).toBe('')
    expect(deviceOf(result.nextState, 'pc2').host?.ip).toBe('192.168.1.101')
    expect(result.nextState.devices.find((device) => device.id === 'pc1')).toBe(deviceOf(before, 'pc1'))
  })

  it('exposes shared engine and solve checker instances', () => {
    expect(networkEngine.reach(officeNetwork(), 'pc1', '8.8.8.8').ok).toBe(true)
    expect(solveChecker.check(officeNetwork(), [{ type: 'internet', fromDeviceId: 'pc1' }])[0]?.ok).toBe(true)
  })
})
