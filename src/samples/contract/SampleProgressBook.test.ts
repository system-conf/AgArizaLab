import { describe, expect, it } from 'vitest'
import { SampleProgressBook } from './SampleProgressBook'
import type { StepStatus } from './SampleTypes'
import { officeSample } from './testSamples'

const sample = officeSample()
const monday = new Date('2026-11-09T10:00:00.000Z')
const tuesday = new Date('2026-11-10T10:00:00.000Z')

describe('SampleProgressBook', () => {
  it('starts empty', () => {
    const book = SampleProgressBook.empty()
    expect(book.of(sample.id)).toBeUndefined()
    expect(book.completion(sample)).toEqual({ done: 0, total: 4, complete: false })
  })

  it('records passed automatic steps only', () => {
    const statuses: StepStatus[] = [
      { stepId: 'pingPrinter', kind: 'auto', ok: true, checks: [] },
      { stepId: 'watchArp', kind: 'manual' },
      { stepId: 'pcsOnline', kind: 'auto', ok: false, checks: [] },
    ]
    const book = SampleProgressBook.empty().withPassedSteps(sample, statuses, monday)
    expect(book.of(sample.id)).toEqual({ sampleId: sample.id, doneStepIds: ['pingPrinter'], updatedAt: monday.toISOString() })
    expect(book.isDone(sample.id, 'pingPrinter')).toBe(true)
    expect(book.isDone(sample.id, 'pcsOnline')).toBe(false)
  })

  it('keeps a step done after its check fails again', () => {
    const passed: StepStatus[] = [{ stepId: 'pingPrinter', kind: 'auto', ok: true, checks: [] }]
    const failed: StepStatus[] = [{ stepId: 'pingPrinter', kind: 'auto', ok: false, checks: [] }]
    const book = SampleProgressBook.empty().withPassedSteps(sample, passed, monday).withPassedSteps(sample, failed, tuesday)
    expect(book.isDone(sample.id, 'pingPrinter')).toBe(true)
    expect(book.of(sample.id)?.updatedAt).toBe(monday.toISOString())
  })

  it('ignores unknown step ids and returns the same book when nothing changes', () => {
    const book = SampleProgressBook.empty()
    expect(book.withStepsDone(sample, ['noSuchStep'], monday)).toBe(book)
  })

  it('sets completedAt when the last step is done and keeps it after un-ticking', () => {
    const all = sample.steps.map((step) => step.id)
    const done = SampleProgressBook.empty().withStepsDone(sample, all, monday)
    expect(done.completion(sample)).toEqual({ done: 4, total: 4, complete: true })
    expect(done.of(sample.id)?.completedAt).toBe(monday.toISOString())
    const undone = done.withStepUndone(sample, 'watchArp', tuesday)
    expect(undone.completion(sample).complete).toBe(false)
    expect(undone.of(sample.id)?.completedAt).toBe(monday.toISOString())
    expect(undone.of(sample.id)?.updatedAt).toBe(tuesday.toISOString())
  })

  it('resets one sample', () => {
    const book = SampleProgressBook.empty().withStepsDone(sample, ['watchArp'], monday)
    expect(book.withReset(sample.id).of(sample.id)).toBeUndefined()
  })

  it('round-trips through JSON', () => {
    const book = SampleProgressBook.empty().withStepsDone(sample, ['watchArp', 'pingPrinter'], monday)
    const copy = SampleProgressBook.fromJson(book.toJson())
    expect(copy.toData()).toEqual(book.toData())
    expect(copy.toData().version).toBe(1)
  })

  it('reads damaged data leniently', () => {
    expect(SampleProgressBook.fromJson(null).toData().samples).toEqual({})
    expect(SampleProgressBook.parse({ version: 2, samples: {} }).toData().samples).toEqual({})
    const parsed = SampleProgressBook.parse({
      version: 1,
      samples: {
        good: { doneStepIds: ['a', 7, 'a'], updatedAt: monday.toISOString(), completedAt: 'never' },
        bad: { doneStepIds: 'a', updatedAt: monday.toISOString() },
        noDate: { doneStepIds: [] },
      },
    })
    expect(parsed.toData().samples).toEqual({ good: { sampleId: 'good', doneStepIds: ['a'], updatedAt: monday.toISOString() } })
  })

  it('treats malformed JSON as an empty book', () => {
    const warn = console.warn
    console.warn = () => undefined
    try {
      expect(SampleProgressBook.fromJson('{oops').toData().samples).toEqual({})
    } finally {
      console.warn = warn
    }
  })
})
