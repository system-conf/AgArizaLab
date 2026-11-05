import { describe, expect, it } from 'vitest'
import { SegmentFinder } from './SegmentFinder'
import {
  deviceOf,
  makeHost,
  makeLink,
  makeRouter,
  officeNetwork,
  updateDevice,
  updateHost,
  updateLink,
  updatePort,
  vlanNetwork,
} from './testFixtures'

const finder = new SegmentFinder()

describe('SegmentFinder', () => {
  it('puts an access-port host into the port VLAN and finds its neighbours', () => {
    const state = officeNetwork()
    const attachment = finder.attachment(state, deviceOf(state, 'pc1'))
    expect(attachment).toEqual({ ok: true, vlan: 1, portId: 'eth0', neighborId: 'switch' })
    const segment = finder.segment(state, 'pc1', 1)
    expect([...segment.members].sort()).toEqual(['pc1', 'pc2', 'printer', 'router', 'switch'])
    expect(finder.pathTo(segment, 'printer')).toEqual(['pc1', 'switch', 'printer'])
  })

  it('keeps VLANs apart at layer 2', () => {
    const state = vlanNetwork()
    const segment = finder.segment(state, 'kasa', 10)
    expect(segment.members.has('kitchen')).toBe(true)
    expect(segment.members.has('guestPc')).toBe(false)
    expect(segment.members.has('phone')).toBe(false)
  })

  it('carries every VLAN over trunks and maps an SSID to its VLAN', () => {
    const state = vlanNetwork()
    expect(finder.attachment(state, deviceOf(state, 'phone'))).toMatchObject({ ok: true, vlan: 20, portId: 'wlan0' })
    const segment = finder.segment(state, 'phone', 20)
    expect(segment.members.has('guestPc')).toBe(true)
    expect(segment.members.has('router')).toBe(true)
    expect(finder.pathTo(segment, 'guestPc')).toEqual(['phone', 'ap', 'switch', 'guestPc'])
  })

  it('joins the router only for VLANs it has an interface for', () => {
    const state = updateDevice(vlanNetwork(), 'router', (router) => ({
      ...router,
      routerInterfaces: (router.routerInterfaces ?? []).filter((item) => item.vlan !== 20),
    }))
    expect(finder.segment(state, 'guestPc', 20).members.has('router')).toBe(false)
  })

  it('places a host plugged straight into the router lan port in VLAN 1', () => {
    const state = {
      devices: [
        makeRouter('router', [{ id: 'LAN', vlan: 1, ip: '192.168.1.1', mask: '255.255.255.0' }]),
        makeHost('pc', 'pc', { ip: '192.168.1.5' }),
      ],
      links: [makeLink('direct', ['pc', 'eth0'], ['router', 'lan'])],
    }
    expect(finder.attachment(state, deviceOf(state, 'pc'))).toMatchObject({ ok: true, vlan: 1 })
    expect(finder.segment(state, 'pc', 1).members.has('router')).toBe(true)
  })

  it('reports unplugged cables, disabled ports and unknown SSIDs', () => {
    const unplugged = updateLink(officeNetwork(), 'pc1Link', { connected: false })
    expect(finder.attachment(unplugged, deviceOf(unplugged, 'pc1'))).toMatchObject({ ok: false, reason: 'cableDisconnected' })

    const disabled = updatePort(officeNetwork(), 'switch', 'Fa0/2', { enabled: false })
    expect(finder.attachment(disabled, deviceOf(disabled, 'pc1'))).toMatchObject({ ok: false, reason: 'portDisabled' })

    const wrongSsid = updateLink(vlanNetwork(), 'phoneLink', { ssid: 'Yok' })
    expect(finder.attachment(wrongSsid, deviceOf(wrongSsid, 'phone'))).toMatchObject({ ok: false, reason: 'cableDisconnected' })
  })

  it('treats a powered-off switch as a dead link', () => {
    const state = updateDevice(officeNetwork(), 'switch', (device) => ({ ...device, powered: false }))
    expect(finder.attachment(state, deviceOf(state, 'pc1'))).toMatchObject({ ok: false, reason: 'cableDisconnected' })
  })
})

describe('SegmentFinder — address owners', () => {
  it('finds nobody for an address two hosts share, and the router over a host', () => {
    const shared = updateHost(officeNetwork(), 'printer', { ip: '192.168.1.20' })
    const segment = finder.segment(shared, 'pc2', 1)
    expect(finder.findAddress(shared, segment, '192.168.1.20')).toBeUndefined()

    const routerAddress = updateHost(officeNetwork(), 'printer', { ip: '192.168.1.1' })
    expect(finder.findAddress(routerAddress, finder.segment(routerAddress, 'pc2', 1), '192.168.1.1')?.id).toBe('router')
  })

  it('detects a conflict with a host or a router interface of the same VLAN only', () => {
    const shared = updateHost(officeNetwork(), 'printer', { ip: '192.168.1.20' })
    expect(finder.hasAddressConflict(shared, deviceOf(shared, 'pc1'))).toBe(true)
    expect(finder.hasAddressConflict(shared, deviceOf(shared, 'printer'))).toBe(true)
    expect(finder.hasAddressConflict(shared, deviceOf(shared, 'pc2'))).toBe(false)

    // kasa (VLAN 10) using the router's VLAN 20 address: the router does not answer for it on VLAN 10.
    const otherVlan = updateHost(vlanNetwork(), 'kasa', { ip: '192.168.20.1' })
    expect(finder.hasAddressConflict(otherVlan, deviceOf(otherVlan, 'kasa'))).toBe(false)
    const sameVlan = updateHost(vlanNetwork(), 'kasa', { ip: '192.168.10.1' })
    expect(finder.hasAddressConflict(sameVlan, deviceOf(sameVlan, 'kasa'))).toBe(true)
  })
})
