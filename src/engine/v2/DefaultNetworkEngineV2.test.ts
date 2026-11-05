import { describe, expect, it } from 'vitest'
import { migrateV1ToV2 } from '../../lab/migrations'
import { networkEngineV2, solveCheckerV2 } from '../index'
import { deepFreeze, officeNetwork, updateDevice, updateHost, vlanNetwork } from '../testFixtures'
import { DefaultNetworkEngineV2 } from './DefaultNetworkEngineV2'
import { deviceV2 } from './testLabsV2'

const engine = new DefaultNetworkEngineV2()

describe('DefaultNetworkEngineV2', () => {
  it('never mutates a deep-frozen input state', () => {
    const office = deepFreeze(migrateV1ToV2(updateHost(officeNetwork(), 'pc2', { ip: '', gateway: '', dns: [] })))
    const vlans = deepFreeze(migrateV1ToV2(updateDevice(vlanNetwork(), 'phone', (device) => ({ ...device, kind: 'pc' }))))
    const snapshot = JSON.stringify(office)

    expect(() => {
      engine.reach(office, 'pc1', '8.8.8.8')
      engine.reach(office, 'router', '8.8.8.8')
      engine.reach(vlans, 'kasa', '192.168.20.50')
      engine.resolve(office, 'pc1', 'google.com')
      engine.appLinkStatus(office, 'pc1')
      engine.renewDhcp(office, 'pc2')
      engine.renewDhcp(office, 'pc2', 'eth0')
      for (const link of office.links) engine.linkLight(office, link.id)
      for (const command of ['ipconfig', 'ipconfig /all', 'ipconfig /renew', 'ipconfig /release', 'ping google.com', 'tracert 8.8.8.8', 'nslookup google.com', 'help', 'xyz']) {
        engine.runCommand(office, 'pc2', command)
        engine.runCommand(vlans, 'phone', command)
      }
    }).not.toThrow()
    expect(JSON.stringify(office)).toBe(snapshot)
  })

  it('returns a fresh state from renewDhcp and shares the untouched devices', () => {
    const before = deepFreeze(migrateV1ToV2(updateHost(officeNetwork(), 'pc2', { ip: '', gateway: '', dns: [] })))
    const result = engine.renewDhcp(before, 'pc2')
    expect(result).toMatchObject({ ok: true, ip: '192.168.1.101' })
    if (!result.ok) return
    expect(deviceV2(result.nextState, 'pc1')).toBe(deviceV2(before, 'pc1'))
    expect(deviceV2(before, 'pc2').ports[0]).toMatchObject({ l3: { ipv4: { address: '' } } })
  })

  it('lets a router send (DNS forwarding, the way back)', () => {
    const office = migrateV1ToV2(officeNetwork())
    expect(engine.reach(office, 'router', '8.8.8.8')).toEqual({ ok: true, path: ['router', 'internet'] })
    expect(engine.reach(office, 'router', '192.168.1.150')).toEqual({ ok: true, path: ['router', 'switch', 'printer'] })
    expect(engine.reach(office, 'switch', '192.168.1.1')).toEqual({ ok: false, reason: 'cableDisconnected', atDeviceId: 'switch' })
  })

  it('throws for unknown device ids (programmer error)', () => {
    const office = migrateV1ToV2(officeNetwork())
    expect(() => engine.reach(office, 'nobody', '8.8.8.8')).toThrow('Unknown device id: nobody')
    expect(() => engine.runCommand(office, 'nobody', 'help')).toThrow('Unknown device id: nobody')
  })

  it('exposes shared engine and solve checker instances', () => {
    const office = migrateV1ToV2(officeNetwork())
    expect(networkEngineV2.reach(office, 'pc1', '8.8.8.8').ok).toBe(true)
    expect(solveCheckerV2.check(office, [{ type: 'reachable', fromDeviceId: 'pc1', toDeviceId: 'printer' }])[0]?.ok).toBe(true)
  })
})
