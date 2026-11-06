import { describe, expect, it } from 'vitest'
import type { CanvasPoint } from '../../../domain'
import { failureMilliseconds, hopMilliseconds, PacketAnimationPlan } from './PacketAnimationPlan'

const positions: Record<string, CanvasPoint> = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, c: { x: 100, y: 100 } }

function positionOf(deviceId: string): CanvasPoint {
  const position = positions[deviceId]
  if (!position) throw new Error(`missing ${deviceId}`)
  return position
}

describe('PacketAnimationPlan', () => {
  it('walks out hop by hop and back on success', () => {
    const plan = new PacketAnimationPlan({ path: ['a', 'b', 'c'], ok: true })
    expect(plan.duration).toBe(4 * hopMilliseconds)
    expect(plan.frameAt(hopMilliseconds / 2, positionOf)).toEqual({ kind: 'packet', position: { x: 50, y: 0 }, returning: false })
    expect(plan.frameAt(hopMilliseconds * 1.5, positionOf)).toEqual({ kind: 'packet', position: { x: 100, y: 50 }, returning: false })
    expect(plan.frameAt(hopMilliseconds * 2.5, positionOf)).toEqual({ kind: 'packet', position: { x: 100, y: 50 }, returning: true })
    expect(plan.frameAt(plan.duration, positionOf)).toBeNull()
  })

  it('stops at the last device and marks the failure', () => {
    const plan = new PacketAnimationPlan({ path: ['a', 'b'], ok: false })
    expect(plan.duration).toBe(hopMilliseconds + failureMilliseconds)
    expect(plan.frameAt(hopMilliseconds + 10, positionOf)).toEqual({ kind: 'failed', position: { x: 100, y: 0 } })
  })

  it('marks a failure at the source when the packet never left', () => {
    const plan = new PacketAnimationPlan({ path: ['a'], ok: false })
    expect(plan.frameAt(0, positionOf)).toEqual({ kind: 'failed', position: { x: 0, y: 0 } })
  })

  it('shows nothing for an empty or single-device successful trace', () => {
    expect(new PacketAnimationPlan({ path: [], ok: false }).frameAt(0, positionOf)).toBeNull()
    expect(new PacketAnimationPlan({ path: ['a'], ok: true }).frameAt(0, positionOf)).toBeNull()
  })
})
