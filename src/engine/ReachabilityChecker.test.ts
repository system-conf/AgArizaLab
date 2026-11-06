import { describe, expect, it } from 'vitest'
import { ReachabilityChecker } from './ReachabilityChecker'
import { SegmentFinder } from './SegmentFinder'
import { editHost, editSwitchport } from './testLabs'
import { editNic, officeLab, powerOff, shutPort, unplug, vlanLab, wanDown } from './testNetworks'

const checker = new ReachabilityChecker(new SegmentFinder())

describe('ReachabilityChecker — local checks', () => {
  it('fails with powerOff when the sender is off', () => {
    const state = powerOff(officeLab(), 'pc1')
    expect(checker.reach(state, 'pc1', '192.168.1.1')).toEqual({ ok: false, reason: 'powerOff', atDeviceId: 'pc1' })
  })

  it('fails with cableDisconnected when the cable is unplugged', () => {
    const state = unplug(officeLab(), 'pc1Link')
    expect(checker.reach(state, 'pc1', '192.168.1.1')).toMatchObject({ ok: false, reason: 'cableDisconnected' })
  })

  it('fails with portDisabled when the switch port is shut', () => {
    const state = shutPort(officeLab(), 'switch', 'Fa0/2')
    expect(checker.reach(state, 'pc1', '192.168.1.1')).toEqual({ ok: false, reason: 'portDisabled', atDeviceId: 'switch' })
  })

  it('fails with noIpAddress when the host has no address', () => {
    const state = editNic(officeLab(), 'pc1', { address: '' })
    expect(checker.reach(state, 'pc1', '192.168.1.1')).toMatchObject({ ok: false, reason: 'noIpAddress' })
  })

  it('fails with invalidConfig for a bad address or mask', () => {
    const badIp = editNic(officeLab(), 'pc1', { address: '192.168.1.300' })
    expect(checker.reach(badIp, 'pc1', '192.168.1.1')).toMatchObject({ ok: false, reason: 'invalidConfig' })
    const badMask = editNic(officeLab(), 'pc1', { mask: '255.0.255.0' })
    expect(checker.reach(badMask, 'pc1', '192.168.1.1')).toMatchObject({ ok: false, reason: 'invalidConfig' })
  })

  it('answers loopback and its own address', () => {
    const unplugged = unplug(officeLab(), 'pc1Link')
    expect(checker.reach(unplugged, 'pc1', '127.0.0.1')).toEqual({ ok: true, path: ['pc1'] })
    expect(checker.reach(officeLab(), 'pc1', '192.168.1.20')).toEqual({ ok: true, path: ['pc1'] })
  })
})

describe('ReachabilityChecker — same subnet', () => {
  it('reaches a host in the same segment', () => {
    expect(checker.reach(officeLab(), 'pc1', '192.168.1.150')).toEqual({
      ok: true,
      path: ['pc1', 'switch', 'printer'],
    })
  })

  it('fails with destinationNotInSegment when nobody has the address', () => {
    expect(checker.reach(officeLab(), 'pc1', '192.168.1.99')).toEqual({
      ok: false,
      reason: 'destinationNotInSegment',
      atDeviceId: 'pc1',
    })
  })

  it('does not reach a powered-off destination', () => {
    const state = powerOff(officeLab(), 'printer')
    expect(checker.reach(state, 'pc1', '192.168.1.150')).toMatchObject({ ok: false, reason: 'destinationNotInSegment' })
  })

  it('isolates VLANs: same IP subnet but a different VLAN is unreachable', () => {
    const state = editSwitchport(vlanLab(), 'switch', 'Fa0/3', { accessVlan: 20 })
    expect(checker.reach(state, 'kasa', '192.168.10.30')).toMatchObject({ ok: false, reason: 'destinationNotInSegment' })
  })
})

describe('ReachabilityChecker — gateway and routing', () => {
  it('fails with gatewayNotSet', () => {
    const state = editHost(officeLab(), 'pc1', { defaultGateway: '' })
    expect(checker.reach(state, 'pc1', '8.8.8.8')).toMatchObject({ ok: false, reason: 'gatewayNotSet' })
  })

  it('fails with gatewayOutsideSubnet', () => {
    const state = editHost(officeLab(), 'pc1', { defaultGateway: '192.168.0.1' })
    expect(checker.reach(state, 'pc1', '8.8.8.8')).toMatchObject({ ok: false, reason: 'gatewayOutsideSubnet' })
  })

  it('fails with gatewayUnreachable when no router owns the gateway address', () => {
    const state = editHost(officeLab(), 'pc1', { defaultGateway: '192.168.1.254' })
    expect(checker.reach(state, 'pc1', '8.8.8.8')).toEqual({ ok: false, reason: 'gatewayUnreachable', atDeviceId: 'pc1' })
  })

  it('reaches the internet when the WAN is up', () => {
    expect(checker.reach(officeLab(), 'pc1', '8.8.8.8')).toEqual({
      ok: true,
      path: ['pc1', 'switch', 'router', 'internet'],
    })
  })

  it('fails with wanDown for a public address when the WAN is down', () => {
    expect(checker.reach(wanDown(officeLab()), 'pc1', '8.8.8.8')).toEqual({ ok: false, reason: 'wanDown', atDeviceId: 'router' })
  })

  it('fails with noRouteToDestination for an unknown private network', () => {
    expect(checker.reach(officeLab(), 'pc1', '10.0.0.5')).toEqual({
      ok: false,
      reason: 'noRouteToDestination',
      atDeviceId: 'router',
    })
  })

  it('fails with noRouteToDestination for special-purpose addresses instead of a public reply', () => {
    for (const ip of ['0.1.2.3', '169.254.1.1', '100.64.0.1', '224.0.0.1', '240.0.0.1']) {
      expect(checker.reach(officeLab(), 'pc1', ip), ip).toEqual({
        ok: false,
        reason: 'noRouteToDestination',
        atDeviceId: 'router',
      })
    }
  })

  it('gets no answer from a broadcast address, near or behind the router', () => {
    for (const ip of ['192.168.10.255', '255.255.255.255']) {
      expect(checker.trace(vlanLab(), 'kasa', ip), ip).toMatchObject({
        result: { ok: false, reason: 'destinationNotInSegment', atDeviceId: 'kasa' },
        silent: true,
      })
    }
    expect(checker.trace(vlanLab(), 'kasa', '192.168.20.255')).toMatchObject({ result: { ok: false, atDeviceId: 'router' }, silent: true })
    // The network address is just an address nobody owns: ARP fails, the router reports it.
    expect(checker.trace(vlanLab(), 'kasa', '192.168.20.0')).toMatchObject({ result: { ok: false, reason: 'destinationNotInSegment', atDeviceId: 'router' } })
    expect(checker.trace(vlanLab(), 'kasa', '192.168.20.0').silent).toBeUndefined()
  })

  it('routes between VLANs through the router', () => {
    expect(checker.reach(vlanLab(), 'kasa', '192.168.20.50')).toEqual({
      ok: true,
      path: ['kasa', 'switch', 'router', 'switch', 'guestPc'],
    })
  })

  it('fails with destinationNotInSegment at the router when the other VLAN lacks the host', () => {
    expect(checker.reach(vlanLab(), 'kasa', '192.168.20.77')).toEqual({
      ok: false,
      reason: 'destinationNotInSegment',
      atDeviceId: 'router',
    })
  })

  it('fails with gatewayUnreachable at the destination when it has no route back', () => {
    const state = editHost(vlanLab(), 'guestPc', { defaultGateway: '' })
    expect(checker.reach(state, 'kasa', '192.168.20.50')).toEqual({
      ok: false,
      reason: 'gatewayUnreachable',
      atDeviceId: 'guestPc',
    })
  })

  it('needs the gateway interface to serve the sender VLAN', () => {
    // guestPc sits in VLAN 20 but points at the VLAN 10 interface address with a /16 mask.
    const state = editHost(editNic(vlanLab(), 'guestPc', { mask: '255.255.0.0' }), 'guestPc', { defaultGateway: '192.168.10.1' })
    expect(checker.reach(state, 'guestPc', '8.8.8.8')).toMatchObject({ ok: false, reason: 'gatewayUnreachable' })
  })

  it('reaches the internet over Wi-Fi from the guest VLAN', () => {
    expect(checker.reach(vlanLab(), 'phone', '1.1.1.1')).toEqual({
      ok: true,
      path: ['phone', 'ap', 'switch', 'router', 'internet'],
    })
  })

  it('returns invalidConfig for a malformed destination', () => {
    expect(checker.reach(officeLab(), 'pc1', 'not-an-ip')).toMatchObject({ ok: false, reason: 'invalidConfig' })
  })

  it('throws for an unknown device id (programmer error)', () => {
    expect(() => checker.reach(officeLab(), 'nobody', '8.8.8.8')).toThrow('Unknown device id')
  })
})

describe('ReachabilityChecker — address conflicts', () => {
  it('fails both hosts that share an address in one segment', () => {
    const state = editNic(officeLab(), 'printer', { address: '192.168.1.20' })
    expect(checker.reach(state, 'pc1', '192.168.1.1')).toEqual({ ok: false, reason: 'ipConflict', atDeviceId: 'pc1' })
    expect(checker.reach(state, 'printer', '192.168.1.1')).toEqual({ ok: false, reason: 'ipConflict', atDeviceId: 'printer' })
    expect(checker.trace(state, 'pc1', '8.8.8.8').reached).toEqual(['pc1'])
  })

  it('lets nobody else reach the duplicate address (neither host answers ARP)', () => {
    const state = editNic(officeLab(), 'printer', { address: '192.168.1.20' })
    expect(checker.reach(state, 'pc2', '192.168.1.20')).toEqual({
      ok: false,
      reason: 'destinationNotInSegment',
      atDeviceId: 'pc2',
    })
  })

  it('fails a host that takes the router address while the router keeps working', () => {
    const state = editNic(officeLab(), 'pc1', { address: '192.168.1.1' })
    expect(checker.reach(state, 'pc1', '192.168.1.150')).toMatchObject({ ok: false, reason: 'ipConflict' })
    expect(checker.reach(state, 'pc2', '192.168.1.1')).toMatchObject({ ok: true })
    expect(checker.reach(state, 'pc2', '8.8.8.8')).toMatchObject({ ok: true })
  })

  it('treats a DHCP-assigned duplicate like a static one: both lose it', () => {
    // pc2 leased 192.168.1.101 (DHCP clients probe a lease before using it); the printer takes it statically.
    const state = editNic(officeLab(), 'printer', { address: '192.168.1.101' })
    expect(checker.reach(state, 'pc2', '192.168.1.1')).toEqual({ ok: false, reason: 'ipConflict', atDeviceId: 'pc2' })
    expect(checker.reach(state, 'printer', '192.168.1.1')).toEqual({ ok: false, reason: 'ipConflict', atDeviceId: 'printer' })
    expect(checker.reach(state, 'pc1', '192.168.1.101')).toMatchObject({ ok: false, reason: 'destinationNotInSegment' })
  })

  it('ignores the same address in another VLAN or on a powered-off device', () => {
    const otherVlan = editNic(vlanLab(), 'guestPc', { address: '192.168.10.20' })
    expect(checker.reach(otherVlan, 'kasa', '192.168.10.30')).toMatchObject({ ok: true })

    const off = powerOff(editNic(officeLab(), 'printer', { address: '192.168.1.20' }), 'printer')
    expect(checker.reach(off, 'pc1', '192.168.1.1')).toMatchObject({ ok: true })
  })
})

describe('ReachabilityChecker — invalid host address', () => {
  it('rejects the network and broadcast address of the own subnet', () => {
    for (const address of ['192.168.1.0', '192.168.1.255']) {
      const state = editNic(officeLab(), 'pc1', { address })
      expect(checker.reach(state, 'pc1', '192.168.1.1')).toEqual({ ok: false, reason: 'invalidHostAddress', atDeviceId: 'pc1' })
    }
  })

  it('accepts the same address under a wider mask', () => {
    const state = editNic(officeLab(), 'pc1', { address: '192.168.1.0', mask: '255.255.254.0' })
    expect(checker.reach(state, 'pc1', '192.168.1.1')).toMatchObject({ ok: true })
  })

  it('does not answer for a host configured with a broadcast address', () => {
    const state = editNic(officeLab(), 'printer', { address: '192.168.1.255' })
    expect(checker.reach(state, 'pc1', '192.168.1.255')).toMatchObject({ ok: false, reason: 'destinationNotInSegment' })
  })
})
