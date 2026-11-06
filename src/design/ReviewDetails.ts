import type { DeviceKind, NetworkState, ReviewHint } from '../domain'
import type { LocalizedMessage } from '../domain/Messages'
import { localizedMessage } from '../i18n/messageKeys'
import { DesignLabels } from './DesignLabels'
import type { CostSummary, DeviceCounts } from './DesignInventory'
import type { RequirementMeasure } from './NetworkConditionEvaluator'
import type { RequirementResult } from './RequirementChecker'
import { isLimit, ReviewScoring, type DesignScore } from './ReviewScoring'

/**
 * - `met`: holds and earned its points
 * - `metNotScored`: a limit that holds but earns nothing yet (a network requirement fails)
 * - `failed`: does not hold
 */
export type ReviewStatus = 'met' | 'metNotScored' | 'failed'

/** One requirement in the report screen, hidden ones included, in brief order. */
export interface ReviewedRequirement {
  id: string
  status: ReviewStatus
  ok: boolean
  /** Acceptance test: left out of the live checklist, shown in the review. */
  hidden: boolean
  weight: number
  /** Points earned (0 unless `status` is `met`). */
  earned: number
  /** What the customer wants (`design:requirements.*`). */
  description: LocalizedMessage
  /** `survivesFailure`: "… even when X is down". */
  qualifier?: LocalizedMessage
  /** `design:review.status.*` */
  statusLabel: LocalizedMessage
  /** "3 / 5 devices", "860 / 1000 units" (from the measure). */
  progress?: LocalizedMessage
  /** Explanations: acceptance test, which failure broke it, why a met limit earned nothing. */
  notes: LocalizedMessage[]
}

/** The quotation against the budget. */
export interface BudgetReview {
  total: number
  budget?: number
  /** budget − total (negative = over budget); absent without a budget. */
  remaining?: number
  /** No budget or total ≤ budget. */
  within: boolean
  message: LocalizedMessage
}

/** Devices of one kind in the reviewed lab. */
export interface KindCount {
  kind: DeviceKind
  /** Customer devices (starting lab). */
  provided: number
  /** Devices the learner added. */
  added: number
  label: LocalizedMessage
}

/** A review hint with its brief text (`designBriefs:<briefId>.reviewHints.<id>`). */
export interface ReviewHintText extends ReviewHint {
  message: LocalizedMessage
}

/** Brief-owned texts of the reference design (`designBriefs:<briefId>.*`). */
export interface ReviewPresentation {
  title: LocalizedMessage
  explanation: LocalizedMessage
  presentation: LocalizedMessage
  interviewAnswer: LocalizedMessage
  /** Key of the topic list: render with `translateList(t, topicsKey)`. */
  topicsKey: string
}

/** Namespace of the brief texts (coordinator decision 2, DESIGN_EXERCISES.md). */
const BRIEF_NAMESPACE = 'designBriefs'

/** Builds the presentation parts of the review report (texts, progress, budget, counts). Pure. */
export class ReviewDetails {
  requirements(results: readonly RequirementResult[], state: NetworkState): ReviewedRequirement[] {
    const points = ReviewScoring.points(results)
    return results.map((result, index) => {
      const earned = points[index] ?? 0
      const status: ReviewStatus = !result.ok ? 'failed' : earned > 0 || ReviewScoring.weight(result) === 0 ? 'met' : 'metNotScored'
      const progress = result.measure ? this.progress(result.measure) : undefined
      return {
        id: result.requirement.id,
        status,
        ok: result.ok,
        hidden: result.requirement.hidden === true,
        weight: ReviewScoring.weight(result),
        earned,
        description: result.description,
        ...(result.qualifier ? { qualifier: result.qualifier } : {}),
        statusLabel: localizedMessage(`design:review.status.${status}`),
        ...(progress ? { progress } : {}),
        notes: this.notes(result, status, state),
      }
    })
  }

  verdict(results: readonly RequirementResult[]): LocalizedMessage {
    const passed = results.filter((result) => result.ok).length
    const total = results.length
    return passed === total ? localizedMessage('design:review.verdict.solved', { total }) : localizedMessage('design:review.verdict.partial', { passed, total })
  }

  scoreText(score: DesignScore): LocalizedMessage {
    return localizedMessage('design:review.score', { earned: score.earned, possible: score.possible, percent: ReviewScoring.percent(score) })
  }

  budget(cost: CostSummary, budget: number | undefined): BudgetReview {
    const total = cost.total
    if (budget === undefined) return { total, within: true, message: localizedMessage('design:review.budget.noBudget', { total }) }
    const remaining = budget - total
    const message =
      remaining >= 0
        ? localizedMessage('design:review.budget.within', { total, budget, remaining })
        : localizedMessage('design:review.budget.over', { total, budget, over: -remaining })
    return { total, budget, remaining, within: remaining >= 0, message }
  }

  /** Every kind present in the lab, infrastructure first; counts from `DesignInventory.counts`. */
  devicesByKind(state: NetworkState, counts: DeviceCounts): KindCount[] {
    const totals = new Map<DeviceKind, number>()
    for (const device of state.devices) totals.set(device.kind, (totals.get(device.kind) ?? 0) + 1)
    return [...totals.entries()]
      .sort(([a], [b]) => DesignLabels.compareKinds(a, b))
      .map(([kind, total]) => {
        const added = counts.addedByKind[kind] ?? 0
        return { kind, provided: total - added, added, label: DesignLabels.kind(kind) }
      })
  }

  hintTexts(briefId: string | undefined, hints: readonly ReviewHint[]): ReviewHintText[] {
    if (briefId === undefined) return []
    return hints.map((hint) => ({ ...hint, message: { key: `${BRIEF_NAMESPACE}:${briefId}.reviewHints.${hint.id}` } }))
  }

  presentation(briefId: string | undefined): ReviewPresentation | undefined {
    if (briefId === undefined) return undefined
    const key = (path: string): LocalizedMessage => ({ key: `${BRIEF_NAMESPACE}:${briefId}.${path}` })
    return {
      title: key('title'),
      explanation: key('reference.explanation'),
      presentation: key('reference.presentation'),
      interviewAnswer: key('reference.interviewAnswer'),
      topicsKey: `${BRIEF_NAMESPACE}:${briefId}.topics`,
    }
  }

  private progress(measure: RequirementMeasure): LocalizedMessage {
    return localizedMessage(`design:review.progress.${measure.unit}`, { value: measure.value, limit: measure.limit })
  }

  private notes(result: RequirementResult, status: ReviewStatus, state: NetworkState): LocalizedMessage[] {
    const notes: LocalizedMessage[] = []
    if (result.requirement.hidden === true) notes.push(localizedMessage('design:review.notes.hidden'))
    if (result.brokenBy !== undefined) notes.push(this.brokenBy(state, result.brokenBy))
    if (status === 'metNotScored' && isLimit(result.requirement.condition)) notes.push(localizedMessage('design:review.notes.limitNotScored'))
    return notes
  }

  /** `brokenBy` is a device id or a link id (FailureCase.failedId). */
  private brokenBy(state: NetworkState, failedId: string): LocalizedMessage {
    if (state.devices.some((device) => device.id === failedId)) {
      return localizedMessage('design:review.notes.brokenByDevice', { device: DesignLabels.deviceName(state, failedId) })
    }
    return localizedMessage('design:review.notes.brokenByLink', DesignLabels.linkEnds(state, failedId))
  }
}
