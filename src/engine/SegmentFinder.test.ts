import { describe, expect, it } from 'vitest'
import type { NetworkState } from '../domain'
import { HostAttachment, type SourceSelection } from './HostAttachment'
import { type L3Interface, L3Interfaces } from './L3Interfaces'
import { type Segment, SegmentFinder } from './SegmentFinder'
import { Topology } from './Topology'
import { editLink, editPort, labDevice, labHost, labLink, labRouter } from './testLabs'
import { editNic, officeLab, powerOff, shutPort, unplug, vlanLab } from './testNetworks'

const finder = new SegmentFinder()

/** The layer-3 interface `interfaceId` of a device (default: its first NIC). */
function interfaceOf(state: NetworkState, deviceId: string, interfaceId?: string): L3Interface {
  const device = labDevice(state, deviceId)
  const iface = interfaceId === undefined ? L3Interfaces.nics(device)[0] : L3Interfaces.find(device, interfaceId)
  if (!iface) throw new Error(`${deviceId} has no interface ${interfaceId ?? '(nic)'}`)
  return iface
}

function segmentOf(state: NetworkState, deviceId: string): Segment {
  return finder.segment(state, interfaceOf(state, deviceId))
}

/** Every device the segment's frames pass or reach (switches and APs included), sorted. */
function devicesIn(segment: Segment): string[] {
  return [...new Set(segment.deviceOfNode.values())].sort()
}

/** Interface keys (`device/interface`) of the layer-3 members, sorted. */
function membersOf(segment: Segment): string[] {
  return segment.members.map((member) => L3Interfaces.key(member)).sort()
}

function attachmentOf(state: NetworkState, deviceId: string, toIp = '192.168.1.1'): SourceSelection {
  return HostAttachment.select(Topology.of(state), labDevice(state, deviceId), toIp)
}

/** Another powered device in the host's segment uses its address. */
function hasAddressConflict(state: NetworkState, deviceId: string): boolean {
  const nic = interfaceOf(state, deviceId)
  return finder.conflictingInterface(state, finder.segment(state, nic), deviceId, nic.address) !== undefined
}

describe('SegmentFinder', () => {
  it('puts an access-port host into the port VLAN and finds its neighbours', () => {
    const state = officeLab()
    const attachment = attachmentOf(state, 'pc1')
    expect(attachment).toMatchObject({ ok: true, iface: { deviceId: 'pc1', portId: 'eth0' } })
    expect(HostAttachment.attach(Topology.of(state), interfaceOf(state, 'pc1'))).toEqual({ ok: true })
    const segment = segmentOf(state, 'pc1')
    expect(devicesIn(segment)).toEqual(['pc1', 'pc2', 'printer', 'router', 'switch'])
    // VLAN 1 reaches the router untagged, so its physical LAN port (not a sub-interface) joins.
    expect(membersOf(segment)).toEqual(['pc1/eth0', 'pc2/eth0', 'printer/eth0', 'router/Gi0/0'])
    expect(finder.pathTo(segment, interfaceOf(state, 'printer'))).toEqual(['pc1', 'switch', 'printer'])
  })

  it('keeps VLANs apart at layer 2', () => {
    const devices = devicesIn(segmentOf(vlanLab(), 'kasa'))
    expect(devices).toContain('kitchen')
    expect(devices).not.toContain('guestPc')
    expect(devices).not.toContain('phone')
  })

  it('carries every VLAN over trunks and maps an SSID to its VLAN', () => {
    const state = vlanLab()
    expect(attachmentOf(state, 'phone', '192.168.20.1')).toMatchObject({ ok: true, iface: { portId: 'wlan0' } })
    const segment = segmentOf(state, 'phone')
    // The phone lands in VLAN 20: the router joins through its VLAN 20 sub-interface only.
    expect(membersOf(segment)).toContain('router/Gi0/0.20')
    expect(membersOf(segment)).not.toContain('router/Gi0/0.10')
    expect(devicesIn(segment)).toContain('guestPc')
    expect(devicesIn(segment)).toContain('router')
    expect(finder.pathTo(segment, interfaceOf(state, 'guestPc'))).toEqual(['phone', 'ap', 'switch', 'guestPc'])
  })

  it('joins the router only for VLANs it has an interface for', () => {
    const state = editPort(vlanLab(), 'router', 'Gi0/0', (port) =>
      port.role === 'routed' ? { ...port, subInterfaces: port.subInterfaces.filter((sub) => sub.vlan !== 20) } : port,
    )
    expect(devicesIn(segmentOf(state, 'guestPc'))).not.toContain('router')
  })

  it('places a host plugged straight into the router lan port in VLAN 1', () => {
    const state: NetworkState = {
      devices: [labRouter('router', [{ id: 'Gi0/0', ip: '192.168.1.1' }]), labHost('pc', '192.168.1.5')],
      links: [labLink('direct', ['pc', 'eth0'], ['router', 'Gi0/0'], { cable: 'copperCross' })],
    }
    expect(attachmentOf(state, 'pc')).toMatchObject({ ok: true })
    expect(devicesIn(segmentOf(state, 'pc'))).toContain('router')
  })

  it('reports unplugged cables, disabled ports and unknown SSIDs', () => {
    const unplugged = unplug(officeLab(), 'pc1Link')
    expect(attachmentOf(unplugged, 'pc1')).toMatchObject({ ok: false, reason: 'cableDisconnected' })

    const disabled = shutPort(officeLab(), 'switch', 'Fa0/2')
    expect(attachmentOf(disabled, 'pc1')).toMatchObject({ ok: false, reason: 'portDisabled' })

    const wrongSsid = editLink(vlanLab(), 'phoneLink', (link) => ({ ...link, cable: 'wireless', ssid: 'Yok' }))
    expect(attachmentOf(wrongSsid, 'phone', '192.168.20.1')).toMatchObject({ ok: false, reason: 'cableDisconnected' })
  })

  it('treats a powered-off switch as a dead link', () => {
    const state = powerOff(officeLab(), 'switch')
    expect(attachmentOf(state, 'pc1')).toMatchObject({ ok: false, reason: 'cableDisconnected' })
  })
})

describe('SegmentFinder — address owners', () => {
  it('finds nobody for an address two hosts share, and the router over a host', () => {
    const shared = editNic(officeLab(), 'printer', { address: '192.168.1.20' })
    expect(finder.findAddress(shared, segmentOf(shared, 'pc2'), '192.168.1.20')).toBeUndefined()

    const routerAddress = editNic(officeLab(), 'printer', { address: '192.168.1.1' })
    expect(finder.findAddress(routerAddress, segmentOf(routerAddress, 'pc2'), '192.168.1.1')?.deviceId).toBe('router')
  })

  it('detects a conflict with a host or a router interface of the same VLAN only', () => {
    const shared = editNic(officeLab(), 'printer', { address: '192.168.1.20' })
    expect(hasAddressConflict(shared, 'pc1')).toBe(true)
    expect(hasAddressConflict(shared, 'printer')).toBe(true)
    expect(hasAddressConflict(shared, 'pc2')).toBe(false)

    // kasa (VLAN 10) using the router's VLAN 20 address: the router does not answer for it on VLAN 10.
    const otherVlan = editNic(vlanLab(), 'kasa', { address: '192.168.20.1' })
    expect(hasAddressConflict(otherVlan, 'kasa')).toBe(false)
    const sameVlan = editNic(vlanLab(), 'kasa', { address: '192.168.10.1' })
    expect(hasAddressConflict(sameVlan, 'kasa')).toBe(true)
  })
})
