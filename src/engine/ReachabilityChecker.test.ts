import { describe, expect, it } from 'vitest'
import { ReachabilityChecker } from './ReachabilityChecker'
import { SegmentFinder } from './SegmentFinder'
import { officeNetwork, updateDevice, updateHost, updateLink, updatePort, vlanNetwork } from './testFixtures'

const checker = new ReachabilityChecker(new SegmentFinder())

describe('ReachabilityChecker — local checks', () => {
  it('fails with powerOff when the sender is off', () => {
    const state = updateDevice(officeNetwork(), 'pc1', (device) => ({ ...device, powered: false }))
    expect(checker.reach(state, 'pc1', '192.168.1.1')).toEqual({ ok: false, reason: 'powerOff', atDeviceId: 'pc1' })
  })

  it('fails with cableDisconnected when the cable is unplugged', () => {
    const state = updateLink(officeNetwork(), 'pc1Link', { connected: false })
    expect(checker.reach(state, 'pc1', '192.168.1.1')).toMatchObject({ ok: false, reason: 'cableDisconnected' })
  })

  it('fails with portDisabled when the switch port is shut', () => {
    const state = updatePort(officeNetwork(), 'switch', 'Fa0/2', { enabled: false })
    expect(checker.reach(state, 'pc1', '192.168.1.1')).toEqual({ ok: false, reason: 'portDisabled', atDeviceId: 'switch' })
  })

  it('fails with noIpAddress when the host has no address', () => {
    const state = updateHost(officeNetwork(), 'pc1', { ip: '' })
    expect(checker.reach(state, 'pc1', '192.168.1.1')).toMatchObject({ ok: false, reason: 'noIpAddress' })
  })

  it('fails with invalidConfig for a bad address or mask', () => {
    const badIp = updateHost(officeNetwork(), 'pc1', { ip: '192.168.1.300' })
    expect(checker.reach(badIp, 'pc1', '192.168.1.1')).toMatchObject({ ok: false, reason: 'invalidConfig' })
    const badMask = updateHost(officeNetwork(), 'pc1', { mask: '255.0.255.0' })
    expect(checker.reach(badMask, 'pc1', '192.168.1.1')).toMatchObject({ ok: false, reason: 'invalidConfig' })
  })

  it('answers loopback and its own address', () => {
    const unplugged = updateLink(officeNetwork(), 'pc1Link', { connected: false })
    expect(checker.reach(unplugged, 'pc1', '127.0.0.1')).toEqual({ ok: true, path: ['pc1'] })
    expect(checker.reach(officeNetwork(), 'pc1', '192.168.1.20')).toEqual({ ok: true, path: ['pc1'] })
  })
})

describe('ReachabilityChecker — same subnet', () => {
  it('reaches a host in the same segment', () => {
    expect(checker.reach(officeNetwork(), 'pc1', '192.168.1.150')).toEqual({
      ok: true,
      path: ['pc1', 'switch', 'printer'],
    })
  })

  it('fails with destinationNotInSegment when nobody has the address', () => {
    expect(checker.reach(officeNetwork(), 'pc1', '192.168.1.99')).toEqual({
      ok: false,
      reason: 'destinationNotInSegment',
      atDeviceId: 'pc1',
    })
  })

  it('does not reach a powered-off destination', () => {
    const state = updateDevice(officeNetwork(), 'printer', (device) => ({ ...device, powered: false }))
    expect(checker.reach(state, 'pc1', '192.168.1.150')).toMatchObject({ ok: false, reason: 'destinationNotInSegment' })
  })

  it('isolates VLANs: same IP subnet but a different VLAN is unreachable', () => {
    const state = updatePort(vlanNetwork(), 'switch', 'Fa0/3', { vlan: 20 })
    expect(checker.reach(state, 'kasa', '192.168.10.30')).toMatchObject({ ok: false, reason: 'destinationNotInSegment' })
  })
})

describe('ReachabilityChecker — gateway and routing', () => {
  it('fails with gatewayNotSet', () => {
    const state = updateHost(officeNetwork(), 'pc1', { gateway: '' })
    expect(checker.reach(state, 'pc1', '8.8.8.8')).toMatchObject({ ok: false, reason: 'gatewayNotSet' })
  })

  it('fails with gatewayOutsideSubnet', () => {
    const state = updateHost(officeNetwork(), 'pc1', { gateway: '192.168.0.1' })
    expect(checker.reach(state, 'pc1', '8.8.8.8')).toMatchObject({ ok: false, reason: 'gatewayOutsideSubnet' })
  })

  it('fails with gatewayUnreachable when no router owns the gateway address', () => {
    const state = updateHost(officeNetwork(), 'pc1', { gateway: '192.168.1.254' })
    expect(checker.reach(state, 'pc1', '8.8.8.8')).toEqual({ ok: false, reason: 'gatewayUnreachable', atDeviceId: 'pc1' })
  })

  it('reaches the internet when the WAN is up', () => {
    expect(checker.reach(officeNetwork(), 'pc1', '8.8.8.8')).toEqual({
      ok: true,
      path: ['pc1', 'switch', 'router', 'internet'],
    })
  })

  it('fails with wanDown for a public address when the WAN is down', () => {
    const state = updateDevice(officeNetwork(), 'router', (router) => ({ ...router, wanUp: false }))
    expect(checker.reach(state, 'pc1', '8.8.8.8')).toEqual({ ok: false, reason: 'wanDown', atDeviceId: 'router' })
  })

  it('fails with noRouteToDestination for an unknown private network', () => {
    expect(checker.reach(officeNetwork(), 'pc1', '10.0.0.5')).toEqual({
      ok: false,
      reason: 'noRouteToDestination',
      atDeviceId: 'router',
    })
  })

  it('fails with noRouteToDestination for special-purpose addresses instead of a public reply', () => {
    for (const ip of ['0.1.2.3', '169.254.1.1', '100.64.0.1', '224.0.0.1', '240.0.0.1', '255.255.255.255']) {
      expect(checker.reach(officeNetwork(), 'pc1', ip), ip).toEqual({
        ok: false,
        reason: 'noRouteToDestination',
        atDeviceId: 'router',
      })
    }
  })

  it('routes between VLANs through the router', () => {
    expect(checker.reach(vlanNetwork(), 'kasa', '192.168.20.50')).toEqual({
      ok: true,
      path: ['kasa', 'switch', 'router', 'switch', 'guestPc'],
    })
  })

  it('fails with destinationNotInSegment at the router when the other VLAN lacks the host', () => {
    expect(checker.reach(vlanNetwork(), 'kasa', '192.168.20.77')).toEqual({
      ok: false,
      reason: 'destinationNotInSegment',
      atDeviceId: 'router',
    })
  })

  it('fails with gatewayUnreachable at the destination when it has no route back', () => {
    const state = updateHost(vlanNetwork(), 'guestPc', { gateway: '' })
    expect(checker.reach(state, 'kasa', '192.168.20.50')).toEqual({
      ok: false,
      reason: 'gatewayUnreachable',
      atDeviceId: 'guestPc',
    })
  })

  it('needs the gateway interface to serve the sender VLAN', () => {
    // guestPc sits in VLAN 20 but points at the VLAN 10 interface address with a /16 mask.
    const state = updateHost(vlanNetwork(), 'guestPc', { mask: '255.255.0.0', gateway: '192.168.10.1' })
    expect(checker.reach(state, 'guestPc', '8.8.8.8')).toMatchObject({ ok: false, reason: 'gatewayUnreachable' })
  })

  it('reaches the internet over Wi-Fi from the guest VLAN', () => {
    expect(checker.reach(vlanNetwork(), 'phone', '1.1.1.1')).toEqual({
      ok: true,
      path: ['phone', 'ap', 'switch', 'router', 'internet'],
    })
  })

  it('returns invalidConfig for a malformed destination', () => {
    expect(checker.reach(officeNetwork(), 'pc1', 'not-an-ip')).toMatchObject({ ok: false, reason: 'invalidConfig' })
  })

  it('throws for an unknown device id (programmer error)', () => {
    expect(() => checker.reach(officeNetwork(), 'nobody', '8.8.8.8')).toThrow('Unknown device id')
  })
})
