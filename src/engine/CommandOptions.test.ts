import { describe, expect, it } from 'vitest'
import { CommandOptions } from './CommandOptions'

describe('CommandOptions', () => {
  const spec = { flags: ['d'], valued: ['h'] }

  it('accepts options before or after the target, with - or /, in any case', () => {
    expect(CommandOptions.parse(['8.8.8.8', '/D', '-H', '5'], spec)).toEqual({
      ok: true,
      options: { target: '8.8.8.8', flags: new Set(['d']), values: new Map([['h', { option: '-H', value: '5' }]]) },
    })
  })

  it('reports the first problem', () => {
    expect(CommandOptions.parse(['-x', '8.8.8.8'], spec)).toEqual({ ok: false, error: { kind: 'badOption', option: '-x' } })
    expect(CommandOptions.parse(['8.8.8.8', '-h'], spec)).toEqual({ ok: false, error: { kind: 'missingValue', option: '-h' } })
    expect(CommandOptions.parse(['a', 'b'], spec)).toEqual({ ok: false, error: { kind: 'badParameter', value: 'b' } })
    expect(CommandOptions.parse(['-d'], spec)).toEqual({ ok: false, error: { kind: 'missingTarget' } })
  })

  it('reads whole numbers inside a range', () => {
    expect(CommandOptions.integerIn('20', 1, 20)).toBe(20)
    expect(CommandOptions.integerIn('0', 1, 20)).toBeNull()
    expect(CommandOptions.integerIn('3.5', 1, 20)).toBeNull()
    expect(CommandOptions.integerIn('-3', 0, 20)).toBeNull()
  })
})
