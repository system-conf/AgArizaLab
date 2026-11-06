import { describe, expect, it } from 'vitest'
import { DefaultNetworkEngine } from './DefaultNetworkEngine'
import { editHost, editSwitchport } from './testLabs'
import { editNic, officeLab, vlanLab } from './testNetworks'

const engine = new DefaultNetworkEngine()

describe('AppLinkChecker', () => {
  it('reports ok when the right kind of device answers', () => {
    expect(engine.appLinkStatus(officeLab(), 'pc1')).toEqual([
      { appLinkId: 'printerLink', label: 'Yazıcı', targetIp: '192.168.1.150', ok: true },
    ])
  })

  it('reports wrongDeviceAtAddress when another kind of device has the address', () => {
    const state = editNic(officeLab(), 'pc2', { address: '192.168.1.150' })
    const moved = editNic(state, 'printer', { address: '192.168.1.153' })
    expect(engine.appLinkStatus(moved, 'pc1')).toEqual([
      { appLinkId: 'printerLink', label: 'Yazıcı', targetIp: '192.168.1.150', ok: false, reason: 'wrongDeviceAtAddress' },
    ])
  })

  it('passes the reachability reason through when the target is gone', () => {
    const state = editNic(officeLab(), 'printer', { address: '192.168.1.153' })
    expect(engine.appLinkStatus(state, 'pc1')[0]).toMatchObject({ ok: false, reason: 'destinationNotInSegment' })
  })

  it('fails across a VLAN boundary inside one subnet', () => {
    const state = editSwitchport(vlanLab(), 'switch', 'Fa0/3', { accessVlan: 20 })
    expect(engine.appLinkStatus(state, 'kasa')[0]).toMatchObject({ ok: false, reason: 'destinationNotInSegment' })
    expect(engine.appLinkStatus(vlanLab(), 'kasa')[0]).toMatchObject({ ok: true })
  })

  it('accepts an internet target for kind internet', () => {
    const state = editHost(officeLab(), 'pc1', {
      appLinks: [{ id: 'cloud', label: 'Bulut yedek', targetIp: '203.0.113.30', targetKind: 'internet' }],
    })
    expect(engine.appLinkStatus(state, 'pc1')[0]).toMatchObject({ ok: true })
  })

  it('returns an empty list for devices without AppLinks', () => {
    expect(engine.appLinkStatus(officeLab(), 'printer')).toEqual([])
  })
})

describe('AppLinkChecker — address conflicts', () => {
  it('fails every link of a host whose address is duplicate', () => {
    const state = editNic(officeLab(), 'pc2', { address: '192.168.1.20' })
    expect(engine.appLinkStatus(state, 'pc1')).toEqual([
      { appLinkId: 'printerLink', label: 'Yazıcı', targetIp: '192.168.1.150', ok: false, reason: 'ipConflict' },
    ])
  })
})
