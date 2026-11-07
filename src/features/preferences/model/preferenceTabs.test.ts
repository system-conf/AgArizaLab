import { describe, expect, it } from 'vitest'
import { PREFERENCE_TABS, preferenceTabAfterKey } from './preferenceTabs'

describe('preferenceTabAfterKey', () => {
  it('lists the seven tabs in order', () => {
    expect(PREFERENCE_TABS).toEqual(['appearance', 'map', 'simulation', 'terminal', 'cables', 'language', 'data'])
  })

  it('moves along a horizontal row with Left / Right and wraps around', () => {
    expect(preferenceTabAfterKey('appearance', 'ArrowRight', 'horizontal')).toBe('map')
    expect(preferenceTabAfterKey('appearance', 'ArrowLeft', 'horizontal')).toBe('data')
    expect(preferenceTabAfterKey('data', 'ArrowRight', 'horizontal')).toBe('appearance')
    expect(preferenceTabAfterKey('map', 'ArrowDown', 'horizontal')).toBeNull()
  })

  it('moves along a vertical column with Up / Down', () => {
    expect(preferenceTabAfterKey('map', 'ArrowDown', 'vertical')).toBe('simulation')
    expect(preferenceTabAfterKey('appearance', 'ArrowUp', 'vertical')).toBe('data')
    expect(preferenceTabAfterKey('map', 'ArrowRight', 'vertical')).toBeNull()
  })

  it('reverses the arrows of a horizontal row in a right-to-left page', () => {
    expect(preferenceTabAfterKey('map', 'ArrowLeft', 'horizontal', true)).toBe('simulation')
    expect(preferenceTabAfterKey('map', 'ArrowRight', 'horizontal', true)).toBe('appearance')
    expect(preferenceTabAfterKey('map', 'ArrowDown', 'vertical', true)).toBe('simulation')
  })

  it('jumps to the first and last tab with Home / End and ignores other keys', () => {
    expect(preferenceTabAfterKey('cables', 'Home', 'vertical')).toBe('appearance')
    expect(preferenceTabAfterKey('cables', 'End', 'horizontal')).toBe('data')
    expect(preferenceTabAfterKey('cables', 'Enter', 'horizontal')).toBeNull()
  })
})
