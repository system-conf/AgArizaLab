import { describe, expect, it } from 'vitest'
import { tabAfterKey } from './panelTabs'

describe('tabAfterKey (WAI-ARIA tabs)', () => {
  it('moves with the arrows, wrapping around, and jumps with Home / End', () => {
    expect(tabAfterKey('events', 'ArrowRight')).toBe('inspector')
    expect(tabAfterKey('inspector', 'ArrowRight')).toBe('events')
    expect(tabAfterKey('events', 'ArrowLeft')).toBe('inspector')
    expect(tabAfterKey('inspector', 'Home')).toBe('events')
    expect(tabAfterKey('events', 'End')).toBe('inspector')
    expect(tabAfterKey('events', 'Enter')).toBeNull()
  })

  it('swaps the arrows in a right-to-left page', () => {
    expect(tabAfterKey('events', 'ArrowLeft', true)).toBe('inspector')
    expect(tabAfterKey('inspector', 'ArrowRight', true)).toBe('events')
  })
})
