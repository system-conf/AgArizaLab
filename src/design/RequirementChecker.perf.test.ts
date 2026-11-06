import { describe, expect, it } from 'vitest'
import { DesignReview } from './DesignReview'
import { RequirementChecker } from './RequirementChecker'
import { CAMPUS_REQUIREMENTS, campus, campusRules } from './testCampus'

/** Timed checks; the fastest one is compared, so a busy machine (parallel test files) does not fail the guard. */
const RUNS = 5

/**
 * Measured 2026-11-06 on a dev machine: ~115 ms per check (about half of it settling DHCP for 92
 * clients). The bound is a regression guard for an accidental blow-up (e.g. settling per
 * requirement), with headroom for slow CI runners; it is not a benchmark.
 */
const CEILING_MS = 600

function fastestOf(runs: number, work: () => void): number {
  let fastest = Number.POSITIVE_INFINITY
  for (let run = 0; run < runs; run += 1) {
    const started = performance.now()
    work()
    fastest = Math.min(fastest, performance.now() - started)
  }
  return fastest
}

describe('RequirementChecker performance', () => {
  it('evaluates the ~100-device campus as expected', () => {
    const state = campus()
    expect(state.devices.length).toBeGreaterThanOrEqual(100)
    const ok = Object.fromEntries(new RequirementChecker(campusRules()).check(state).map((result) => [result.requirement.id, result.ok]))
    expect(ok).toMatchObject({ staffOnline: true, guestsOnline: true, staffDns: true, servers: true, staffDhcp: true, subnets: true, staffVlan: true, plan: true })
    // Inter-VLAN routing on the router: guests reach the servers; the WAN link is a single point of failure.
    expect(ok).toMatchObject({ isolation: false, anyLink: false, offline: true })
  })

  it('checks a ~100-device lab fast enough for a debounced live checklist', { timeout: 30_000 }, () => {
    const checker = new RequirementChecker(campusRules())
    checker.check(campus())
    // A fresh state per run: a repeated state would only measure the settle cache.
    const fastest = fastestOf(RUNS, () => checker.check(campus()))
    console.info(`RequirementChecker: ${campus().devices.length} devices, ${CAMPUS_REQUIREMENTS.length} requirements, fastest check ${fastest.toFixed(1)} ms`)
    expect(fastest).toBeLessThan(CEILING_MS)
  })

  it('settles DHCP once per state: a repeated check of the same state is cheaper than a fresh one', () => {
    const checker = new RequirementChecker(campusRules())
    const state = campus()
    const first = checker.check(state)
    const settled = checker.prepare(state).settled
    expect(checker.prepare(state).settled).toBe(settled)
    expect(checker.check(state)).toEqual(first)
  })

  it('reviews the campus (check, single points of failure) within a few checks', { timeout: 30_000 }, () => {
    const review = new DesignReview({ ...campusRules(), reviewHints: [] })
    const fastest = fastestOf(2, () => review.analyze(campus()))
    console.info(`DesignReview: fastest analysis ${fastest.toFixed(1)} ms`)
    expect(fastest).toBeLessThan(CEILING_MS * 4)
  })
})
