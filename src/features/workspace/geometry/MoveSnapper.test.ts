import { describe, expect, it } from 'vitest'
import { MoveSnapper } from './MoveSnapper'

const snapper = new MoveSnapper(24, 5)

describe('MoveSnapper', () => {
  it('snaps a finished drag once, to the nearest grid point', () => {
    expect(snapper.dragEnd({ x: 37, y: 11 }, true)).toEqual({ x: 48, y: 0 })
    expect(snapper.dragEnd({ x: -13, y: 59 }, true)).toEqual({ x: -24, y: 48 })
  })

  it('keeps a drag where it was dropped with snapping off', () => {
    expect(snapper.dragEnd({ x: 37.5, y: 11 }, false)).toEqual({ x: 37.5, y: 11 })
  })

  it('turns a focused node arrow-key move into whole grid steps with snapping on', () => {
    expect(snapper.keyMove({ x: 48, y: 48 }, { x: 53, y: 48 }, true)).toEqual({ x: 72, y: 48 })
    // Shift + arrow: four key steps = four grid steps.
    expect(snapper.keyMove({ x: 48, y: 48 }, { x: 48, y: 28 }, true)).toEqual({ x: 48, y: -48 })
    // A node off the grid lands on it.
    expect(snapper.keyMove({ x: 50, y: 40 }, { x: 45, y: 40 }, true)).toEqual({ x: 24, y: 48 })
    expect(snapper.keyMove({ x: 50, y: 40 }, { x: 45, y: 40 }, false)).toEqual({ x: 45, y: 40 })
  })
})
