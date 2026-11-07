import { describe, expect, it } from 'vitest'
import type { MapPacket } from './PacketMarkers'
import { along, ICON_CLEARANCE, PacketPlacement } from './PacketPlacement'

function packet(fraction: number, dropped = false): MapPacket {
  return {
    transmissionId: 1,
    linkId: 'l1',
    fromDeviceId: 'a',
    toDeviceId: 'b',
    fraction,
    protocol: 'icmp',
    flowId: 'f1',
    dropped,
    sentByEventId: 1,
    arrivalEventId: dropped ? 2 : null,
  }
}

describe('PacketPlacement', () => {
  const placement = new PacketPlacement({ devices: { a: { x: 0, y: 0 }, b: { x: 200, y: 0 } } }, 48)

  it('moves along the visible part of the cable, outside both icons', () => {
    expect(placement.centreOf('a')).toEqual({ x: 24, y: 24 })
    expect(placement.place(packet(0))).toEqual({ x: 24 + ICON_CLEARANCE, y: 24, droppedHere: false })
    expect(placement.place(packet(1)).x).toBeCloseTo(224 - ICON_CLEARANCE)
    expect(placement.place(packet(0.5)).x).toBeCloseTo(124)
  })

  it('shows a dropped frame as dropped only once it arrived', () => {
    expect(placement.place(packet(0.9, true)).droppedHere).toBe(false)
    expect(placement.place(packet(1, true)).droppedHere).toBe(true)
  })

  it('falls back to the straight line between close devices and to the origin for unknown ones', () => {
    expect(along({ x: 0, y: 0 }, { x: 40, y: 0 }, 0.5)).toEqual({ x: 20, y: 0 })
    expect(placement.centreOf('missing')).toEqual({ x: 24, y: 24 })
    expect(PacketPlacement.transform({ x: 3, y: 4, droppedHere: false })).toBe('translate(3px, 4px) translate(-50%, -50%)')
  })
})
