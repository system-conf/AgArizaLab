import type { SampleDefinition, SampleProgress, StepStatus } from './SampleTypes'

/** Serialized form (JSON in localStorage under SAMPLE_PROGRESS_STORAGE_KEY). */
export interface SampleProgressData {
  version: 1
  samples: Record<string, SampleProgress>
}

export interface SampleCompletion {
  done: number
  total: number
  complete: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function parseProgress(sampleId: string, raw: unknown): SampleProgress | null {
  if (!isRecord(raw) || !Array.isArray(raw.doneStepIds) || !isTimestamp(raw.updatedAt)) return null
  const doneStepIds = [...new Set(raw.doneStepIds.filter((id): id is string => typeof id === 'string'))]
  const progress: SampleProgress = { sampleId, doneStepIds, updatedAt: raw.updatedAt }
  if (isTimestamp(raw.completedAt)) progress.completedAt = raw.completedAt
  return progress
}

/**
 * Learner progress of every sample (immutable: every change returns a new book). A step stays done
 * once it passed or was ticked, also when the learner breaks the lab afterwards ("break it" ideas).
 * Step ids that a sample no longer has are kept but not counted (see completion).
 */
export class SampleProgressBook {
  private readonly samples: ReadonlyMap<string, SampleProgress>

  private constructor(samples: ReadonlyMap<string, SampleProgress>) {
    this.samples = samples
  }

  static empty(): SampleProgressBook {
    return new SampleProgressBook(new Map())
  }

  /** Lenient: anything unreadable becomes an empty book; invalid entries are dropped. */
  static parse(raw: unknown): SampleProgressBook {
    if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.samples)) return SampleProgressBook.empty()
    const samples = new Map<string, SampleProgress>()
    for (const [sampleId, entry] of Object.entries(raw.samples)) {
      const progress = parseProgress(sampleId, entry)
      if (progress) samples.set(sampleId, progress)
    }
    return new SampleProgressBook(samples)
  }

  /** Parses the stored JSON text (null / malformed = empty book). */
  static fromJson(text: string | null): SampleProgressBook {
    if (text === null) return SampleProgressBook.empty()
    try {
      return SampleProgressBook.parse(JSON.parse(text))
    } catch (error) {
      console.warn('Unreadable sample progress, starting fresh', error)
      return SampleProgressBook.empty()
    }
  }

  of(sampleId: string): SampleProgress | undefined {
    return this.samples.get(sampleId)
  }

  isDone(sampleId: string, stepId: string): boolean {
    return this.samples.get(sampleId)?.doneStepIds.includes(stepId) ?? false
  }

  completion(sample: Pick<SampleDefinition, 'id' | 'steps'>): SampleCompletion {
    const total = sample.steps.length
    const done = sample.steps.filter((step) => this.isDone(sample.id, step.id)).length
    return { done, total, complete: total > 0 && done === total }
  }

  /** Marks steps as done (ticked manual steps or passed checks). */
  withStepsDone(sample: Pick<SampleDefinition, 'id' | 'steps'>, stepIds: readonly string[], now: Date): SampleProgressBook {
    const known = new Set(sample.steps.map((step) => step.id))
    const current = this.samples.get(sample.id)
    const done = new Set(current?.doneStepIds ?? [])
    const added = stepIds.filter((id) => known.has(id) && !done.has(id))
    if (added.length === 0) return this
    return this.with(sample, [...done, ...added], now, current?.completedAt)
  }

  /** Records every automatic step that passes in `statuses` (StepChecker.check). */
  withPassedSteps(sample: Pick<SampleDefinition, 'id' | 'steps'>, statuses: readonly StepStatus[], now: Date): SampleProgressBook {
    const passed = statuses.filter((status) => status.kind === 'auto' && status.ok).map((status) => status.stepId)
    return this.withStepsDone(sample, passed, now)
  }

  /** Un-ticks a step (manual steps; the completion time is kept once reached). */
  withStepUndone(sample: Pick<SampleDefinition, 'id' | 'steps'>, stepId: string, now: Date): SampleProgressBook {
    const current = this.samples.get(sample.id)
    if (!current?.doneStepIds.includes(stepId)) return this
    return this.with(sample, current.doneStepIds.filter((id) => id !== stepId), now, current.completedAt)
  }

  /** Forgets the sample's progress ("start again"). */
  withReset(sampleId: string): SampleProgressBook {
    if (!this.samples.has(sampleId)) return this
    const samples = new Map(this.samples)
    samples.delete(sampleId)
    return new SampleProgressBook(samples)
  }

  toData(): SampleProgressData {
    return { version: 1, samples: Object.fromEntries(this.samples) }
  }

  toJson(): string {
    return JSON.stringify(this.toData())
  }

  private with(sample: Pick<SampleDefinition, 'id' | 'steps'>, doneStepIds: string[], now: Date, completedAt: string | undefined): SampleProgressBook {
    const progress: SampleProgress = { sampleId: sample.id, doneStepIds, updatedAt: now.toISOString() }
    const allDone = sample.steps.length > 0 && sample.steps.every((step) => doneStepIds.includes(step.id))
    const completion = completedAt ?? (allDone ? progress.updatedAt : undefined)
    if (completion !== undefined) progress.completedAt = completion
    const samples = new Map(this.samples)
    samples.set(sample.id, progress)
    return new SampleProgressBook(samples)
  }
}
