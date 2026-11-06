import { describe, expect, it } from 'vitest'
import { ProbeReports } from './ProbeReports'

const hop = (n: number) => ({ ip: `10.0.0.${n}`, baseTimeMs: n - 1 })

describe('ProbeReports.withSilence (Windows tracert gives up after 4 silent hops)', () => {
  it('keeps a silent hop between answering ones', () => {
    const route = { hops: [hop(1), null, hop(3)], ending: { kind: 'complete' } as const }
    expect(ProbeReports.withSilence(route)).toEqual(route)
  })

  it('ends a timed-out route at its last answering hop', () => {
    expect(ProbeReports.withSilence({ hops: [hop(1), null, null], ending: { kind: 'timedOut' } })).toEqual({ hops: [hop(1)], ending: { kind: 'timedOut' } })
  })

  it('stops before four silent hops in a row, whatever came after', () => {
    const hops = [hop(1), null, null, null, null, hop(6)]
    expect(ProbeReports.withSilence({ hops, ending: { kind: 'complete' } })).toEqual({ hops: [hop(1)], ending: { kind: 'timedOut' } })
    expect(ProbeReports.withSilence({ hops: [null, null, null, null], ending: { kind: 'hopLimit' } })).toEqual({ hops: [], ending: { kind: 'timedOut' } })
  })
})
