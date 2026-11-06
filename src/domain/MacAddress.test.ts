import { describe, expect, it } from 'vitest'
import { MacAddress } from './MacAddress'

describe('MacAddress', () => {
  it('validates colon-separated MACs in either case', () => {
    expect(MacAddress.isValid('00:1A:2B:10:00:01')).toBe(true)
    expect(MacAddress.isValid('00:1a:2b:10:00:01')).toBe(true)
    expect(MacAddress.isValid('00-1A-2B-10-00-01')).toBe(false)
    expect(MacAddress.isValid('00:1A:2B:10:00')).toBe(false)
  })

  it('normalizes to upper case', () => {
    expect(MacAddress.normalize('00:1a:2b:10:00:0f')).toBe('00:1A:2B:10:00:0F')
  })

  it('derives locally administered MACs, distinct per index and from the base', () => {
    expect(MacAddress.derive('00:1A:2B:10:00:01', 1)).toBe('02:1B:2B:10:00:01')
    expect(MacAddress.derive('00:1A:2B:10:00:01', 2)).toBe('02:18:2B:10:00:01')
    const derived = Array.from({ length: 52 }, (_, index) => MacAddress.derive('00:1A:2B:10:00:01', index + 1))
    expect(new Set(derived).size).toBe(52)
    expect(derived).not.toContain('00:1A:2B:10:00:01')
  })

  it('is deterministic', () => {
    expect(MacAddress.derive('00:00:5E:00:01:01', 3)).toBe(MacAddress.derive('00:00:5E:00:01:01', 3))
  })

  it('throws on programmer errors', () => {
    expect(() => MacAddress.derive('not a mac', 1)).toThrow()
    expect(() => MacAddress.derive('00:1A:2B:10:00:01', 0)).toThrow()
    expect(() => MacAddress.derive('00:1A:2B:10:00:01', 256)).toThrow()
  })
})
