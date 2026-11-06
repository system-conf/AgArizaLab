import { describe, expect, it } from 'vitest'
import { SampleProgressBook, type StepStatus } from '../../../samples'
import { officeSample } from '../../../samples/contract/testSamples'
import { LessonSteps } from './LessonSteps'

const NOW = new Date('2026-11-06T10:00:00Z')
const sample = officeSample()

function auto(stepId: string, ok: boolean): StepStatus {
  return { stepId, kind: 'auto', ok, checks: [] }
}

const statuses: StepStatus[] = [auto('pingPrinter', true), { stepId: 'watchArp', kind: 'manual' }, auto('pcsOnline', false), auto('printerInPlan', false)]

describe('LessonSteps', () => {
  it('shows automatic steps as checking before the first check and marks the first step as current', () => {
    const views = LessonSteps.build(sample, null, SampleProgressBook.empty())
    expect(views.map((view) => view.state)).toEqual(['checking', 'unticked', 'checking', 'checking'])
    expect(views.map((view) => view.kind)).toEqual(['auto', 'manual', 'auto', 'auto'])
    expect(views.map((view) => view.number)).toEqual([1, 2, 3, 4])
    expect(views.map((view) => view.current)).toEqual([true, false, false, false])
  })

  it('joins live statuses with the recorded progress', () => {
    const book = SampleProgressBook.empty().withStepsDone(sample, ['pingPrinter', 'watchArp', 'printerInPlan'], NOW)
    const views = LessonSteps.build(sample, statuses, book)
    expect(views.map((view) => view.state)).toEqual(['passing', 'ticked', 'open', 'doneBroken'])
    expect(views.map((view) => view.done)).toEqual([true, true, false, true])
    expect(views.find((view) => view.current)?.step.id).toBe('pcsOnline')
  })

  it('keeps a recorded automatic step done while its first check is still waiting', () => {
    const book = SampleProgressBook.empty().withStepsDone(sample, ['pcsOnline'], NOW)
    expect(LessonSteps.build(sample, null, book)[2]?.state).toBe('done')
  })

  it('has no current step when every step is done', () => {
    const book = SampleProgressBook.empty().withStepsDone(
      sample,
      sample.steps.map((step) => step.id),
      NOW,
    )
    expect(LessonSteps.build(sample, statuses, book).some((view) => view.current)).toBe(false)
  })
})
