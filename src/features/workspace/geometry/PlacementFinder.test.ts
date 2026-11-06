import { describe, expect, it } from 'vitest'
import type { CanvasPoint } from '../../../domain/v2'
import { DEVICE_SPACING } from '../workspaceConstants'
import { PlacementFinder } from './PlacementFinder'

const finder = new PlacementFinder(DEVICE_SPACING)

function overlaps(first: CanvasPoint, second: CanvasPoint): boolean {
  return Math.abs(first.x - second.x) < 140 && Math.abs(first.y - second.y) < 120
}

describe('PlacementFinder', () => {
  it('keeps the wanted spot when it is free', () => {
    expect(finder.find({ x: 0, y: 0 }, [{ x: 144, y: 0 }, { x: 0, y: 120 }])).toEqual({ x: 0, y: 0 })
  })

  it('moves a device beside a neighbour whose label would overlap', () => {
    expect(finder.find({ x: 0, y: 0 }, [{ x: 0, y: 0 }])).toEqual({ x: 144, y: 0 })
    const neighbour = { x: 72, y: 24 }
    expect(overlaps(finder.find({ x: 0, y: 0 }, [neighbour]), neighbour)).toBe(false)
  })

  it('never places labels on top of each other when adding many devices at one spot', () => {
    const placed: CanvasPoint[] = []
    for (let index = 0; index < 20; index += 1) placed.push(finder.find({ x: 240, y: 240 }, placed))
    for (const [index, point] of placed.entries()) {
      for (const other of placed.slice(index + 1)) expect(overlaps(point, other)).toBe(false)
    }
  })

  it('accepts one number for both axes', () => {
    expect(new PlacementFinder(72).find({ x: 0, y: 0 }, [{ x: 0, y: 0 }])).toEqual({ x: 72, y: 0 })
  })
})
