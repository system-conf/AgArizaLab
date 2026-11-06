import type { SampleDefinition, SampleProgressBook, SampleStep, StepStatus } from '../../../samples'

/**
 * What the lesson panel shows for one step:
 * - automatic steps: `passing` (holds on the lab now), `done` (passed earlier, not checked yet),
 *   `doneBroken` (passed earlier, does not hold now: the learner broke the lab, which is fine),
 *   `checking` (not done, first check still waiting), `open` (not done, does not hold);
 * - manual steps: `ticked` / `unticked` (the learner ticks them).
 */
export type LessonStepState = 'passing' | 'done' | 'doneBroken' | 'checking' | 'open' | 'ticked' | 'unticked'

export interface LessonStepView {
  step: SampleStep
  /** 1-based position. */
  number: number
  kind: 'auto' | 'manual'
  /** Recorded as done in the progress book. */
  done: boolean
  state: LessonStepState
  /** The first step that is not done yet (the panel highlights it). */
  current: boolean
}

/** Joins the live StepChecker statuses with the learner's progress into the step list of the panel. */
export class LessonSteps {
  /** `statuses` = latest StepChecker.check result, or null before the first check. */
  static build(sample: Pick<SampleDefinition, 'id' | 'steps'>, statuses: readonly StepStatus[] | null, book: SampleProgressBook): LessonStepView[] {
    const byId = new Map((statuses ?? []).map((status) => [status.stepId, status]))
    const views = sample.steps.map((step, index): LessonStepView => {
      const kind = (step.checks ?? []).length === 0 ? 'manual' : 'auto'
      const done = book.isDone(sample.id, step.id)
      const status = byId.get(step.id)
      const holds = status?.kind === 'auto' ? status.ok : null
      return { step, number: index + 1, kind, done, state: LessonSteps.stateOf(kind, done, holds), current: false }
    })
    const firstOpen = views.findIndex((view) => !view.done)
    return views.map((view, index) => (index === firstOpen ? { ...view, current: true } : view))
  }

  private static stateOf(kind: 'auto' | 'manual', done: boolean, holds: boolean | null): LessonStepState {
    if (kind === 'manual') return done ? 'ticked' : 'unticked'
    if (holds === true) return 'passing'
    if (done) return holds === false ? 'doneBroken' : 'done'
    return holds === null ? 'checking' : 'open'
  }
}
