import { describe, expect, it } from 'vitest'
import type { NetworkState } from '../domain'
import { networkEngine, solveChecker } from './index'
import { DefaultNetworkEngine } from './DefaultNetworkEngine'
import { editDevice, editHost, labDevice } from './testLabs'
import { editNic, officeLab, vlanLab } from './testNetworks'

const engine = new DefaultNetworkEngine()

const COMMANDS = [
  'ipconfig',
  'ipconfig /all',
  'ipconfig /renew',
  'ipconfig /release',
  'ping google.com',
  'tracert 8.8.8.8',
  'nslookup google.com',
  'help',
  'xyz',
]

/** Recursively freezes a value so any mutation attempt throws in strict mode. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
  }
  return value
}

/** The office with pc2 holding no lease yet: no address, gateway or DNS. */
function officeWithoutPc2Address(): NetworkState {
  return editHost(editNic(officeLab(), 'pc2', { address: '' }), 'pc2', { defaultGateway: '', dnsServers: [] })
}

describe('DefaultNetworkEngine', () => {
  it('never mutates a deep-frozen input state', () => {
    const office = deepFreeze(officeWithoutPc2Address())
    // The Wi-Fi client becomes a PC so the commands really run (phones have no terminal).
    const vlans = deepFreeze(editDevice(vlanLab(), 'phone', (device) => ({ ...device, kind: 'pc', modelId: 'pc' })))
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
      for (const command of COMMANDS) {
        engine.runCommand(office, 'pc2', command)
        engine.runCommand(vlans, 'phone', command)
      }
    }).not.toThrow()
    expect(JSON.stringify(office)).toBe(snapshot)
  })

  it('returns a fresh state from renewDhcp and shares the untouched devices', () => {
    const before = deepFreeze(officeWithoutPc2Address())
    const result = engine.renewDhcp(before, 'pc2')
    expect(result).toMatchObject({ ok: true, ip: '192.168.1.101' })
    if (!result.ok) return
    expect(labDevice(result.nextState, 'pc1')).toBe(labDevice(before, 'pc1'))
    expect(labDevice(before, 'pc2').ports[0]).toMatchObject({ l3: { ipv4: { address: '' } } })
    expect(labDevice(result.nextState, 'pc2').ports[0]).toMatchObject({ l3: { ipv4: { address: '192.168.1.101' } } })
  })

  it('lets a router send (DNS forwarding, the way back)', () => {
    const office = officeLab()
    expect(engine.reach(office, 'router', '8.8.8.8')).toEqual({ ok: true, path: ['router', 'internet'] })
    expect(engine.reach(office, 'router', '192.168.1.150')).toEqual({ ok: true, path: ['router', 'switch', 'printer'] })
    expect(engine.reach(office, 'switch', '192.168.1.1')).toEqual({ ok: false, reason: 'cableDisconnected', atDeviceId: 'switch' })
  })

  it('throws for unknown device ids (programmer error)', () => {
    const office = officeLab()
    expect(() => engine.reach(office, 'nobody', '8.8.8.8')).toThrow('Unknown device id: nobody')
    expect(() => engine.runCommand(office, 'nobody', 'help')).toThrow('Unknown device id: nobody')
  })

  it('exposes shared engine and solve checker instances', () => {
    const office = officeLab()
    expect(networkEngine.reach(office, 'pc1', '8.8.8.8').ok).toBe(true)
    expect(solveChecker.check(office, [{ type: 'internet', fromDeviceId: 'pc1' }])[0]?.ok).toBe(true)
    expect(solveChecker.check(office, [{ type: 'reachable', fromDeviceId: 'pc1', toDeviceId: 'printer' }])[0]?.ok).toBe(true)
  })
})
