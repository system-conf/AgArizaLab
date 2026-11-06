import { describe, expect, it } from 'vitest'
import type { Device, Link } from '../../../domain'
import { labHost } from '../../../engine/testLabs'
import { localizedMessage } from '../../../i18n/messageKeys'
import { EventHighlights } from './EventHighlights'
import { InspectorModels } from './InspectorModels'
import { PacketMarkers } from './PacketMarkers'
import { SimplePduTool, PDU_TOOL_OFF } from './SimplePduTool'
import { ARP_REQUEST, ECHO_FRAME, simEvent, transmission } from './simFixtures'

const WINDOW = { from: 1, to: 2, serial: 1, animate: true }

describe('PacketMarkers', () => {
  it('moves frames in flight during the step and leaves earlier arrivals out', () => {
    const moving = transmission({ id: 1, departAt: 1, arriveAt: 2 })
    const wireless = transmission({ id: 2, departAt: 1, arriveAt: 3, frameId: 'f2' })
    const arrivedBefore = transmission({ id: 3, departAt: 0, arriveAt: 1 })
    const leavingNow = transmission({ id: 4, departAt: 2, arriveAt: 3 })
    const markers = new PacketMarkers([moving, wireless, arrivedBefore, leavingNow], [], WINDOW)
    expect(markers.count).toBe(3)
    expect(markers.at(0).map((marker) => [marker.transmissionId, marker.fraction])).toEqual([
      [1, 0],
      [2, 0],
      [4, 0],
    ])
    expect(markers.at(0.5).map((marker) => marker.fraction)).toEqual([0.5, 0.25, 0])
    expect(markers.at(2).map((marker) => marker.fraction)).toEqual([1, 0.5, 0])
  })

  it('marks a frame dropped by its receiver and links both events', () => {
    const sent = transmission({ id: 1, eventId: 7, departAt: 1, arriveAt: 2 })
    const arrival = simEvent({ id: 9, time: 2, deviceId: 'sw', inPortId: 'fa1', frameId: 'f1', action: 'dropped', reason: 'vlanNotAllowed' })
    const elsewhere = simEvent({ id: 10, time: 2, deviceId: 'sw', inPortId: 'fa2', frameId: 'f1', action: 'forwarded' })
    const [marker] = new PacketMarkers([sent], [elsewhere, arrival], WINDOW).at(1)
    expect(marker).toMatchObject({ dropped: true, sentByEventId: 7, arrivalEventId: 9, fromDeviceId: 'pc1', toDeviceId: 'sw', linkId: 'l1', protocol: 'icmp' })
  })

  it('draws nothing without a step and handles zero-latency links', () => {
    expect(new PacketMarkers([transmission({ id: 1 })], [], null).at(1)).toEqual([])
    expect(PacketMarkers.fraction(transmission({ id: 1, departAt: 2, arriveAt: 2 }), 2)).toBe(1)
  })
})

describe('EventHighlights', () => {
  const links: Link[] = [
    { id: 'l1', cable: 'copperStraight', connected: true, a: { deviceId: 'pc1', portId: 'eth0' }, b: { deviceId: 'sw', portId: 'fa1' } },
    { id: 'l2', cable: 'copperStraight', connected: true, a: { deviceId: 'sw', portId: 'fa2' }, b: { deviceId: 'pc2', portId: 'eth0' } },
    { id: 'l3', cable: 'copperStraight', connected: true, a: { deviceId: 'sw', portId: 'fa3' }, b: { deviceId: 'pc3', portId: 'eth0' } },
  ]

  it('marks the device, the inbound link and the links it sent on', () => {
    const event = simEvent({ id: 4, deviceId: 'sw', inPortId: 'fa1', lastDeviceId: 'pc1', outPortIds: ['fa2', 'fa3'], action: 'flooded' })
    const sent = [transmission({ id: 1, eventId: 4, linkId: 'l2' }), transmission({ id: 2, eventId: 4, linkId: 'l3' }), transmission({ id: 3, eventId: 5, linkId: 'l1' })]
    expect(EventHighlights.of(event, sent, links)).toEqual({ deviceId: 'sw', linkIds: ['l1', 'l2', 'l3'] })
    expect(EventHighlights.of(simEvent({ id: 1 }), [], links)).toEqual({ deviceId: 'pc1', linkIds: [] })
  })
})

describe('InspectorModels', () => {
  const nameOf = (id: string) => id.toUpperCase()

  it('lists in layers cable-up and out layers top-down with notes and ports', () => {
    const note = (layer: 1 | 2 | 3, direction: 'in' | 'out', key: Parameters<typeof localizedMessage>[0]) => ({ layer, direction, message: localizedMessage(key) })
    const event = simEvent({
      id: 3,
      deviceId: 'r1',
      inPortId: 'Gi0/0',
      outPortIds: ['Gi0/1'],
      inbound: ECHO_FRAME,
      outbound: ECHO_FRAME,
      action: 'forwarded',
      notes: [note(3, 'in', 'simulation:notes.l3.packetReceived'), note(2, 'in', 'simulation:notes.l2.frameAccepted'), note(3, 'out', 'simulation:notes.l3.ttlDecremented')],
      causeEventId: 2,
      lastDeviceId: 'sw',
    })
    const view = InspectorModels.build(event, nameOf)
    expect(view.inLayers.map((row) => [row.layer, row.protocols, row.notes.length])).toEqual([
      [1, [], 0],
      [2, ['ethernet'], 1],
      [3, ['ipv4', 'icmp'], 1],
    ])
    expect(view.inLayers[0]?.title).toEqual({ key: 'simulation:ui.inspector.port', params: { port: 'Gi0/0' } })
    expect(view.outLayers.map((row) => row.layer)).toEqual([3, 2, 1])
    expect(view.outLayers[2]?.title.params).toEqual({ port: 'Gi0/1' })
    expect(view.inLayers[2]?.title).toEqual({ key: 'simulation:protocols.ipv4' })
    expect(view.decision).toEqual({ key: 'simulation:ui.decisions.forwarded', params: { device: 'R1' } })
    expect(view).toMatchObject({ reason: null, causeEventId: 2, lastDeviceId: 'sw', inboundDetails: [{ protocol: 'ethernet' }, { protocol: 'ipv4' }, { protocol: 'icmp' }] })
  })

  it('has no in layers for a created PDU and keeps the drop reason', () => {
    const view = InspectorModels.build(simEvent({ id: 1, outbound: ARP_REQUEST, outPortIds: ['eth0'], action: 'dropped', reason: 'linkDown', protocol: 'arp' }), nameOf)
    expect(view.inLayers).toEqual([])
    expect(view.outLayers.map((row) => [row.layer, row.protocols])).toEqual([
      [2, ['ethernet', 'arp']],
      [1, []],
    ])
    expect(view.reason).toEqual({ key: 'simulation:reasons.linkDown' })
  })
})

describe('SimplePduTool', () => {
  const host = (id: string, address: string): Device => labHost(id, address)
  const addresses: Record<string, string[]> = { a: ['10.0.0.1'], b: ['10.0.0.2', '10.0.1.2'], c: [] }
  const addressesOf = (device: Device) => addresses[device.id] ?? []

  it('picks source then destination and queues one 32-byte echo to the first address', () => {
    const afterSource = SimplePduTool.click(SimplePduTool.start(), host('a', ''), addressesOf)
    expect(afterSource).toEqual({ kind: 'next', state: { kind: 'destination', sourceId: 'a' } })
    const done = SimplePduTool.click(afterSource.state, host('b', ''), addressesOf)
    expect(done).toEqual({ kind: 'inject', state: PDU_TOOL_OFF, targetIp: '10.0.0.2', request: { kind: 'ping', deviceId: 'a', targetIp: '10.0.0.2', count: 1, size: 32 } })
  })

  it('refuses the source itself and devices without an address; Escape steps back', () => {
    const waiting = { kind: 'destination', sourceId: 'a' } as const
    expect(SimplePduTool.click(waiting, host('a', ''), addressesOf)).toMatchObject({ kind: 'refused', reason: 'sameDevice', state: waiting })
    expect(SimplePduTool.click(waiting, host('c', ''), addressesOf)).toMatchObject({ kind: 'refused', reason: 'noAddress' })
    expect(SimplePduTool.back(waiting)).toEqual({ kind: 'source' })
    expect(SimplePduTool.back({ kind: 'source' })).toEqual(PDU_TOOL_OFF)
    expect(SimplePduTool.isActive(PDU_TOOL_OFF)).toBe(false)
    expect(SimplePduTool.click(PDU_TOOL_OFF, host('a', ''), addressesOf)).toEqual({ kind: 'next', state: PDU_TOOL_OFF })
  })
})
