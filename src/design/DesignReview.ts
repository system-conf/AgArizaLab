import type { DesignCondition, DesignExerciseDefinition, DeviceKind, NetworkCondition, NetworkState, ReviewHint } from '../domain'
import type { LocalizedMessage } from '../domain/Messages'
import { localizedMessage } from '../i18n/messageKeys'
import type { CostSummary, DeviceCounts } from './DesignInventory'
import { FailureScenarios } from './FailureScenarios'
import { conditionGroups } from './NetworkConditionEvaluator'
import { RequirementChecker, type DesignRules, type RequirementCheckerOptions, type RequirementResult } from './RequirementChecker'
import { ReviewDetails, type BudgetReview, type KindCount, type ReviewedRequirement, type ReviewHintText, type ReviewPresentation } from './ReviewDetails'
import { ReviewScoring, type DesignScore } from './ReviewScoring'

export type { DesignScore } from './ReviewScoring'

/** A device whose failure breaks at least one met connectivity requirement. */
export interface SinglePointOfFailure {
  deviceId: string
  /** Ids of the requirements that stop holding while the device is down, in brief order. */
  breaks: string[]
  /**
   * The device is directly linked to a member of a broken requirement (an access switch / AP): it is
   * expected for single-homed end devices, unlike a core device whose loss cuts off whole groups.
   */
  access: boolean
  /** Name of the device in the reviewed lab. */
  deviceName: string
  kind: DeviceKind
  /** Names of the groups of the broken requirements, in brief order. */
  groups: string[]
  /** Why it matters and what to do (`design:review.spof.access` / `.core`). */
  explanation: LocalizedMessage
}

export interface DesignReviewReport {
  /** Every requirement, hidden ones included. */
  results: RequirementResult[]
  /** Every requirement holds. */
  solved: boolean
  score: DesignScore
  cost: CostSummary
  budget?: number
  counts: DeviceCounts
  /** Infrastructure devices only (never group members or the ISP cloud), in lab order. */
  singlePointsOfFailure: SinglePointOfFailure[]
  /** Hints that apply: unconditional ones and those whose requirement failed. */
  hints: ReviewHint[]
  // --- Report screen (D1 refinements): texts and per-requirement details. ---
  /** `results` with status, points, progress and explanations, in brief order. */
  requirements: ReviewedRequirement[]
  /** "8 of 11 requirements are met." */
  verdict: LocalizedMessage
  /** Earned share in whole percent. */
  scorePercent: number
  /** "Score: 9 / 12 (75%)" */
  scoreText: LocalizedMessage
  /** Cost against the budget (also without a budget: the total). */
  budgetReview: BudgetReview
  /** Every device kind in the lab, infrastructure first, split into customer / added devices. */
  devicesByKind: KindCount[]
  /** `hints` with their brief texts; empty when the brief has no id. */
  hintTexts: ReviewHintText[]
  /** Hints are shown right away once the design is solved; before that only when the learner asks. */
  hintsRevealed: boolean
  /** Reference design texts of the brief; absent when the brief has no id. */
  presentation?: ReviewPresentation
}

/** `id` (optional) names the brief texts: hint texts and the presentation section. */
export type DesignReviewBrief = DesignRules & Pick<DesignExerciseDefinition, 'budget' | 'reviewHints'> & Partial<Pick<DesignExerciseDefinition, 'id'>>

/** Requirements whose loss under a single failure makes a device a single point of failure. */
type ConnectivityCondition = Extract<NetworkCondition, { type: 'reachable' | 'internet' | 'resolves' }>

function isConnectivity(condition: DesignCondition): condition is ConnectivityCondition {
  return condition.type === 'reachable' || condition.type === 'internet' || condition.type === 'resolves'
}

/**
 * The design review report at the end of a brief (DESIGN_EXERCISES.md §1, §6): requirement results,
 * score, quotation, device counts, single points of failure and review hints. Pure.
 */
export class DesignReview {
  private readonly brief: DesignReviewBrief
  private readonly checker: RequirementChecker
  private readonly failures = new FailureScenarios()
  private readonly details = new ReviewDetails()

  constructor(brief: DesignReviewBrief, options: RequirementCheckerOptions = {}) {
    this.brief = brief
    this.checker = new RequirementChecker(brief, options)
  }

  analyze(state: NetworkState): DesignReviewReport {
    const results = this.checker.check(state)
    const failed = new Set(results.filter((result) => !result.ok).map((result) => result.requirement.id))
    const score = DesignReview.score(results)
    const cost = this.checker.inventory.cost(state)
    const counts = this.checker.inventory.counts(state)
    const hints = this.brief.reviewHints.filter((hint) => hint.requirementId === undefined || failed.has(hint.requirementId))
    const presentation = this.details.presentation(this.brief.id)
    return {
      results,
      solved: failed.size === 0,
      score,
      cost,
      ...(this.brief.budget === undefined ? {} : { budget: this.brief.budget }),
      counts,
      singlePointsOfFailure: this.singlePointsOfFailure(state, results),
      hints,
      requirements: this.details.requirements(results, state),
      verdict: this.details.verdict(results),
      scorePercent: ReviewScoring.percent(score),
      scoreText: this.details.scoreText(score),
      budgetReview: this.details.budget(cost, this.brief.budget),
      devicesByKind: this.details.devicesByKind(state, counts),
      hintTexts: this.details.hintTexts(this.brief.id, hints),
      hintsRevealed: failed.size === 0,
      ...(presentation ? { presentation } : {}),
    }
  }

  /**
   * Weighted score (weight absent = 1). Limits count only when every other requirement holds, so an
   * empty design does not earn the budget points.
   */
  static score(results: readonly RequirementResult[]): DesignScore {
    return ReviewScoring.score(results)
  }

  /**
   * Powers off each infrastructure device in turn (never a group member or the ISP cloud) and
   * re-evaluates the met reachable / internet / resolves requirements on the settled network.
   */
  singlePointsOfFailure(state: NetworkState, results: readonly RequirementResult[] = this.checker.check(state)): SinglePointOfFailure[] {
    const met = results.flatMap((result) => {
      const condition = result.requirement.condition
      return result.ok && isConnectivity(condition) ? [{ id: result.requirement.id, condition }] : []
    })
    if (met.length === 0) return []
    const settled = this.checker.prepare(state).settled
    const members = this.checker.groups.allMemberIds()
    const spofs: SinglePointOfFailure[] = []
    for (const device of settled.devices) {
      if (!device.powered || device.kind === 'internet' || members.has(device.id)) continue
      const down = this.failures.deviceDown(settled, device.id).state
      const broken = met.filter((requirement) => !this.checker.evaluateNetwork(down, requirement.condition).ok)
      if (broken.length === 0) continue
      const groupIds = [...new Set(broken.flatMap((requirement) => conditionGroups(requirement.condition)))]
      const access = this.failures.neighboursOf(settled, this.checker.groups.memberIds(groupIds)).has(device.id)
      const groups = groupIds.map((groupId) => this.checker.groups.group(groupId).name)
      const params = { device: device.name, groups: groups.join(', ') }
      spofs.push({
        deviceId: device.id,
        breaks: broken.map((requirement) => requirement.id),
        access,
        deviceName: device.name,
        kind: device.kind,
        groups,
        explanation: access ? localizedMessage('design:review.spof.access', params) : localizedMessage('design:review.spof.core', params),
      })
    }
    return spofs
  }
}
