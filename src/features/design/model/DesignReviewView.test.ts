import { describe, expect, it } from 'vitest'
import { DesignReview } from '../../../design'
import { editDevice, officeBrief, officeReferenceState, officeStartState } from '../../../design/testBriefs'
import { DesignReviewView } from './DesignReviewView'

describe('DesignReviewView', () => {
  const brief = officeBrief()
  const review = new DesignReview(brief)

  it('summarises a solved reference design', () => {
    const state = officeReferenceState()
    const view = DesignReviewView.build(review.analyze(state))
    expect(view.solved).toBe(true)
    expect(view.percent).toBe(100)
    expect(view.requirements).toHaveLength(brief.requirements.length)
    expect(view.hiddenCount).toBe(1)
    expect(view.budget).toMatchObject({ budget: 1000, tone: expect.stringMatching(/ok|near/) })
    expect(view.added).toBe(2)
    expect(view.provided).toBe(5)
    expect(view.hintsRevealed).toBe(true)
  })

  it('names the single points of failure and the requirements they break', () => {
    const state = officeReferenceState()
    const view = DesignReviewView.build(review.analyze(state))
    const router = view.singlePointsOfFailure.find((spof) => spof.deviceId === 'router')
    expect(router?.deviceName).toBe('router')
    expect(router?.breaks.map((broken) => broken.id)).toContain('officeOnline')
    expect(router?.breaks.every((broken) => broken.description.key.startsWith('design:requirements.'))).toBe(true)
  })

  it('shows a start without a design as unsolved, with hints behind a button and no failures to report', () => {
    const state = officeStartState()
    const view = DesignReviewView.build(review.analyze(state))
    expect(view.solved).toBe(false)
    expect(view.percent).toBe(0)
    expect(view.singlePointsOfFailure).toEqual([])
    expect(view.hintsRevealed).toBe(false)
    expect(view.hints.map((hint) => hint.id)).toEqual(['presentation', 'dhcpScope'])
    expect(view.cost.total).toBe(0)
  })

  it('takes device names from the reviewed lab', () => {
    const state = editDevice(officeReferenceState(), 'switch', (device) => ({ ...device, name: 'Core switch' }))
    const view = DesignReviewView.build(review.analyze(state))
    expect(view.singlePointsOfFailure.find((spof) => spof.deviceId === 'switch')?.deviceName).toBe('Core switch')
  })
})
