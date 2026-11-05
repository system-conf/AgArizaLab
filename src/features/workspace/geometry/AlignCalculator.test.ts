import { describe, expect, it } from 'vitest'
import { AlignCalculator, type PlacedItem } from './AlignCalculator'
import { PlacementFinder } from './PlacementFinder'

const calculator = new AlignCalculator(24)
const items: PlacedItem[] = [
  { id: 'a', x: 10, y: 50, width: 48, height: 48 },
  { id: 'b', x: 100, y: 20, width: 48, height: 48 },
  { id: 'c', x: 40, y: 80, width: 100, height: 40 },
]

describe('AlignCalculator', () => {
  it('aligns left edges on the leftmost item and skips items already in place', () => {
    expect(calculator.align(items, 'left')).toEqual([
      { id: 'b', to: { x: 10, y: 20 } },
      { id: 'c', to: { x: 10, y: 80 } },
    ])
  })

  it('aligns top edges on the topmost item', () => {
    expect(calculator.align(items, 'top')).toEqual([
      { id: 'a', to: { x: 10, y: 20 } },
      { id: 'c', to: { x: 40, y: 20 } },
    ])
  })

  it('aligns horizontal centres on the centre of the bounding box', () => {
    // Box 10..148 → centre 79.
    expect(calculator.align(items, 'center')).toEqual([
      { id: 'a', to: { x: 55, y: 50 } },
      { id: 'b', to: { x: 55, y: 20 } },
      { id: 'c', to: { x: 29, y: 80 } },
    ])
  })

  it('does nothing with fewer than two items', () => {
    expect(calculator.align(items.slice(0, 1), 'left')).toEqual([])
  })

  it('nudges every item and snaps to the grid', () => {
    expect(calculator.nudge(items.slice(0, 2), 4, -8)).toEqual([
      { id: 'a', to: { x: 14, y: 42 } },
      { id: 'b', to: { x: 104, y: 12 } },
    ])
    expect(calculator.nudge(items, 0, 0)).toEqual([])
    expect(calculator.snap({ x: 35, y: -11 })).toEqual({ x: 24, y: 0 })
  })
})

describe('PlacementFinder', () => {
  const finder = new PlacementFinder(48)

  it('keeps the wanted point when it is free', () => {
    expect(finder.find({ x: 0, y: 0 }, [{ x: 100, y: 0 }])).toEqual({ x: 0, y: 0 })
  })

  it('moves right, then down, when the spot is taken', () => {
    expect(finder.find({ x: 0, y: 0 }, [{ x: 0, y: 0 }])).toEqual({ x: 48, y: 0 })
    expect(finder.find({ x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 48, y: 0 }])).toEqual({ x: 0, y: 48 })
  })

  it('gives up after the try limit and returns the wanted point', () => {
    const crowded = Array.from({ length: 81 }, (_, index) => ({ x: ((index % 9) - 4) * 48, y: (Math.floor(index / 9) - 4) * 48 }))
    expect(new PlacementFinder(48, 9).find({ x: 0, y: 0 }, crowded)).toEqual({ x: 0, y: 0 })
  })
})
