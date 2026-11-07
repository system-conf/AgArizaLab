import { describe, expect, it } from 'vitest'
import { THEMES } from '../../preferences'
import { ThemeCycle } from './ThemeCycle'

describe('ThemeCycle', () => {
  it('goes light → dark → system → light', () => {
    expect(ThemeCycle.next('light')).toBe('dark')
    expect(ThemeCycle.next('dark')).toBe('system')
    expect(ThemeCycle.next('system')).toBe('light')
  })

  it('reaches every theme', () => {
    const seen = new Set(THEMES.map((theme) => ThemeCycle.next(theme)))
    expect([...seen].sort()).toEqual([...THEMES].sort())
  })
})
