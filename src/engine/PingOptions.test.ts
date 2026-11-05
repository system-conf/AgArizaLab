import { describe, expect, it } from 'vitest'
import { PingOptions } from './PingOptions'

function settingsOf(line: string) {
  const parsed = PingOptions.parse(line.split(' '))
  if (!parsed.ok) throw new Error(`Unexpected error ${parsed.error.kind}`)
  return parsed.settings
}

describe('PingOptions', () => {
  it('defaults to 4 requests of 32 bytes', () => {
    expect(settingsOf('8.8.8.8')).toEqual({ target: '8.8.8.8', count: 4, size: 32, continuous: false, countLimited: false })
  })

  it('reads -n and -l in any position and case', () => {
    expect(settingsOf('-N 7 8.8.8.8 -l 1200')).toEqual({ target: '8.8.8.8', count: 7, size: 1200, continuous: false, countLimited: false })
    expect(settingsOf('8.8.8.8 -4 -l 0')).toMatchObject({ size: 0 })
  })

  it('clamps large counts to 20 and marks them as limited', () => {
    expect(settingsOf('-n 1000 8.8.8.8')).toMatchObject({ count: 20, countLimited: true })
    expect(settingsOf('-n 20 8.8.8.8')).toMatchObject({ count: 20, countLimited: false })
  })

  it('treats -t as four requests', () => {
    expect(settingsOf('-t 8.8.8.8')).toMatchObject({ count: 4, continuous: true })
    expect(settingsOf('-n 9 -t 8.8.8.8')).toMatchObject({ count: 4, continuous: true })
    expect(settingsOf('-n 50 -t 8.8.8.8')).toMatchObject({ count: 4, continuous: true, countLimited: false })
  })

  it('rejects values outside the Windows ranges', () => {
    expect(PingOptions.parse(['-n', '0', '8.8.8.8'])).toEqual({
      ok: false,
      error: { kind: 'badValue', option: '-n', min: 1, max: 4294967295 },
    })
    expect(PingOptions.parse(['-L', '65501', '8.8.8.8'])).toEqual({
      ok: false,
      error: { kind: 'badValue', option: '-L', min: 0, max: 65500 },
    })
    expect(PingOptions.parse(['-l', 'big', '8.8.8.8'])).toMatchObject({ ok: false, error: { kind: 'badValue' } })
  })

  it('rejects unknown options', () => {
    expect(PingOptions.parse(['-x', '8.8.8.8'])).toEqual({ ok: false, error: { kind: 'badOption', option: '-x' } })
  })
})
