import { describe, expect, it } from 'vitest'
import type { DesignRequirement } from '../domain'
import { DesignReview } from './DesignReview'
import { editDevice, officeBrief } from './testBriefs'

function withRequirement(requirement: DesignRequirement) {
  const brief = officeBrief()
  return { ...brief, requirements: [...brief.requirements, requirement] }
}

describe('DesignReview report screen', () => {
  const brief = officeBrief()
  const review = new DesignReview(brief)

  it('lists every requirement with status, points and notes for a solved design', () => {
    const report = review.analyze(brief.reference.state)
    expect(report.requirements.map((requirement) => requirement.status)).toEqual(Array(11).fill('met'))
    const printerOnline = report.requirements.find((requirement) => requirement.id === 'printerOnline')
    expect(printerOnline).toMatchObject({
      ok: true,
      hidden: true,
      weight: 2,
      earned: 2,
      description: { key: 'design:requirements.internet', params: { group: 'Printer' } },
      statusLabel: { key: 'design:review.status.met' },
      progress: { key: 'design:review.progress.members', params: { value: 1, limit: 1 } },
      notes: [{ key: 'design:review.notes.hidden' }],
    })
    expect(report.requirements.find((requirement) => requirement.id === 'printingOffline')?.qualifier).toEqual({
      key: 'design:failures.device',
      params: { device: 'isp' },
    })
    expect(report.verdict).toEqual({ key: 'design:review.verdict.solved', params: { total: 11 } })
    expect(report.scorePercent).toBe(100)
    expect(report.scoreText).toEqual({ key: 'design:review.score', params: { earned: 12, possible: 12, percent: 100 } })
  })

  it('compares the quotation with the budget', () => {
    expect(review.analyze(brief.reference.state).budgetReview).toEqual({
      total: 860,
      budget: 1000,
      remaining: 140,
      within: true,
      message: { key: 'design:review.budget.within', params: { total: 860, budget: 1000, remaining: 140 } },
    })
    const tight = new DesignReview({ ...brief, budget: 500 }).analyze(brief.reference.state)
    expect(tight.budgetReview).toMatchObject({ remaining: -360, within: false, message: { key: 'design:review.budget.over', params: { over: 360 } } })
    const { budget: _unused, ...withoutBudget } = brief
    void _unused
    expect(new DesignReview(withoutBudget).analyze(brief.reference.state).budgetReview).toEqual({
      total: 860,
      within: true,
      message: { key: 'design:review.budget.noBudget', params: { total: 860 } },
    })
  })

  it('counts devices by kind, infrastructure first, split into customer and added devices', () => {
    expect(review.analyze(brief.reference.state).devicesByKind).toEqual([
      { kind: 'internet', provided: 1, added: 0, label: { key: 'catalog:kinds.internet' } },
      { kind: 'router', provided: 0, added: 1, label: { key: 'catalog:kinds.router' } },
      { kind: 'switch', provided: 0, added: 1, label: { key: 'catalog:kinds.switch' } },
      { kind: 'pc', provided: 3, added: 0, label: { key: 'catalog:kinds.pc' } },
      { kind: 'printer', provided: 1, added: 0, label: { key: 'catalog:kinds.printer' } },
    ])
  })

  it('marks met limits of an unfinished design as not scored and keeps the hints back', () => {
    const report = review.analyze(brief.lab.state)
    const budget = report.requirements.find((requirement) => requirement.id === 'budget')
    expect(budget).toMatchObject({
      status: 'metNotScored',
      earned: 0,
      progress: { key: 'design:review.progress.cost', params: { value: 0, limit: 1000 } },
      notes: [{ key: 'design:review.notes.limitNotScored' }],
    })
    expect(report.requirements.find((requirement) => requirement.id === 'officeOnline')).toMatchObject({
      status: 'failed',
      statusLabel: { key: 'design:review.status.failed' },
      progress: { params: { value: 0, limit: 3 } },
    })
    expect(report.verdict).toEqual({ key: 'design:review.verdict.partial', params: { passed: 2, total: 11 } })
    expect(report.hintsRevealed).toBe(false)
  })

  it('names the failure that broke a survivesFailure requirement', () => {
    const offline = new DesignReview(
      withRequirement({ id: 'onlineOffline', condition: { type: 'survivesFailure', failure: { scope: 'device', deviceId: 'isp' }, requirement: { type: 'internet', group: 'office' } } }),
    ).analyze(brief.reference.state)
    expect(offline.requirements.find((requirement) => requirement.id === 'onlineOffline')?.notes).toEqual([
      { key: 'design:review.notes.brokenByDevice', params: { device: 'isp' } },
    ])
    const anyLink = new DesignReview(
      withRequirement({ id: 'redundant', condition: { type: 'survivesFailure', failure: { scope: 'anyLink' }, requirement: { type: 'internet', group: 'office' } } }),
    ).analyze(brief.reference.state)
    expect(anyLink.requirements.find((requirement) => requirement.id === 'redundant')?.notes).toEqual([
      { key: 'design:review.notes.brokenByLink', params: { a: 'isp', b: 'router' } },
    ])
  })

  it('builds hint and presentation texts from the brief id (designBriefs namespace)', () => {
    const noDhcp = editDevice(brief.reference.state, 'router', (router) => ({ ...router, services: { ...router.services, dhcp: { enabled: false, pools: [], excludedRanges: [] } } }))
    const report = review.analyze(noDhcp)
    expect(report.hintTexts).toEqual([
      { id: 'presentation', message: { key: 'designBriefs:testOffice.reviewHints.presentation' } },
      { id: 'dhcpScope', requirementId: 'officeDhcp', message: { key: 'designBriefs:testOffice.reviewHints.dhcpScope' } },
    ])
    expect(report.presentation).toEqual({
      title: { key: 'designBriefs:testOffice.title' },
      explanation: { key: 'designBriefs:testOffice.reference.explanation' },
      presentation: { key: 'designBriefs:testOffice.reference.presentation' },
      interviewAnswer: { key: 'designBriefs:testOffice.reference.interviewAnswer' },
      topicsKey: 'designBriefs:testOffice.topics',
    })
    expect(review.analyze(brief.reference.state).hintsRevealed).toBe(true)
  })

  it('leaves brief texts out when the brief has no id', () => {
    const { id: _unused, ...anonymous } = brief
    void _unused
    const report = new DesignReview(anonymous).analyze(brief.reference.state)
    expect(report.hintTexts).toEqual([])
    expect(report.presentation).toBeUndefined()
    expect(report.hints).toEqual([{ id: 'presentation' }])
  })
})
