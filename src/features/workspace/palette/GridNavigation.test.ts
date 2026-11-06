import { describe, expect, it } from 'vitest'
import { GridNavigation, isGridKey } from './GridNavigation'

describe('GridNavigation', () => {
  it('steps left and right and stops at the ends', () => {
    expect(GridNavigation.next(1, 'ArrowRight', 5, 2)).toBe(2)
    expect(GridNavigation.next(4, 'ArrowRight', 5, 2)).toBe(4)
    expect(GridNavigation.next(0, 'ArrowLeft', 5, 2)).toBe(0)
  })

  it('moves by a row and stays when there is no tile below or above', () => {
    expect(GridNavigation.next(1, 'ArrowDown', 5, 2)).toBe(3)
    expect(GridNavigation.next(3, 'ArrowDown', 5, 2)).toBe(3)
    expect(GridNavigation.next(4, 'ArrowUp', 5, 2)).toBe(2)
    expect(GridNavigation.next(1, 'ArrowUp', 5, 3)).toBe(1)
  })

  it('jumps to the first and last tile', () => {
    expect(GridNavigation.next(2, 'Home', 5, 2)).toBe(0)
    expect(GridNavigation.next(2, 'End', 5, 2)).toBe(4)
  })

  it('mirrors left and right in right-to-left layouts', () => {
    expect(GridNavigation.next(1, 'ArrowLeft', 5, 2, true)).toBe(2)
    expect(GridNavigation.next(1, 'ArrowRight', 5, 2, true)).toBe(0)
  })

  it('handles empty grids and recognises its keys', () => {
    expect(GridNavigation.next(0, 'End', 0, 2)).toBe(0)
    expect(isGridKey('ArrowDown')).toBe(true)
    expect(isGridKey('Enter')).toBe(false)
  })
})
