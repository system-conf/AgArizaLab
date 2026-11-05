import { describe, expect, it } from 'vitest'
import { AppLinkChecker } from './AppLinkChecker'
import { ReachabilityChecker } from './ReachabilityChecker'
import { SegmentFinder } from './SegmentFinder'
import { officeNetwork, updateDevice, updateHost, updatePort, vlanNetwork } from './testFixtures'

const checker = new AppLinkChecker(new ReachabilityChecker(new SegmentFinder()))

describe('AppLinkChecker', () => {
  it('reports ok when the right kind of device answers', () => {
    expect(checker.status(officeNetwork(), 'pc1')).toEqual([
      { appLinkId: 'printerLink', label: 'Yazıcı', targetIp: '192.168.1.150', ok: true },
    ])
  })

  it('reports wrongDeviceAtAddress when another kind of device has the address', () => {
    const state = updateHost(officeNetwork(), 'pc2', { ip: '192.168.1.150' })
    const moved = updateHost(state, 'printer', { ip: '192.168.1.153' })
    expect(checker.status(moved, 'pc1')).toEqual([
      { appLinkId: 'printerLink', label: 'Yazıcı', targetIp: '192.168.1.150', ok: false, reason: 'wrongDeviceAtAddress' },
    ])
  })

  it('passes the reachability reason through when the target is gone', () => {
    const state = updateHost(officeNetwork(), 'printer', { ip: '192.168.1.153' })
    expect(checker.status(state, 'pc1')[0]).toMatchObject({ ok: false, reason: 'destinationNotInSegment' })
  })

  it('fails across a VLAN boundary inside one subnet', () => {
    const state = updatePort(vlanNetwork(), 'switch', 'Fa0/3', { vlan: 20 })
    expect(checker.status(state, 'kasa')[0]).toMatchObject({ ok: false, reason: 'destinationNotInSegment' })
    expect(checker.status(vlanNetwork(), 'kasa')[0]).toMatchObject({ ok: true })
  })

  it('accepts an internet target for kind internet', () => {
    const state = updateDevice(officeNetwork(), 'pc1', (device) => ({
      ...device,
      appLinks: [{ id: 'cloud', label: 'Bulut yedek', targetIp: '203.0.113.30', targetKind: 'internet' }],
    }))
    expect(checker.status(state, 'pc1')[0]).toMatchObject({ ok: true })
  })

  it('returns an empty list for devices without AppLinks', () => {
    expect(checker.status(officeNetwork(), 'printer')).toEqual([])
  })
})

describe('AppLinkChecker — address conflicts', () => {
  it('fails every link of a host whose address is duplicate', () => {
    const state = updateHost(officeNetwork(), 'pc2', { ip: '192.168.1.20' })
    expect(checker.status(state, 'pc1')).toEqual([
      { appLinkId: 'printerLink', label: 'Yazıcı', targetIp: '192.168.1.150', ok: false, reason: 'ipConflict' },
    ])
  })
})
