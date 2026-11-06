import type { DesignCondition, DesignExerciseDefinition, NetworkCondition, NetworkState, ReviewHint } from '../domain'
import type { CostSummary, DeviceCounts } from './DesignInventory'
import { FailureScenarios } from './FailureScenarios'
import { conditionGroups } from './NetworkConditionEvaluator'
import { RequirementChecker, type DesignRules, type RequirementCheckerOptions, type RequirementResult } from './RequirementChecker'

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
}

export interface DesignScore {
  earned: number
  possible: number
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
}

export type DesignReviewBrief = DesignRules & Pick<DesignExerciseDefinition, 'budget' | 'reviewHints'>

/** Requirements whose loss under a single failure makes a device a single point of failure. */
type ConnectivityCondition = Extract<NetworkCondition, { type: 'reachable' | 'internet' | 'resolves' }>

function isConnectivity(condition: DesignCondition): condition is ConnectivityCondition {
  return condition.type === 'reachable' || condition.type === 'internet' || condition.type === 'resolves'
}

/** Limits (budget, device counts) only earn points once the network itself works. */
function isLimit(condition: DesignCondition): boolean {
  return condition.type === 'maxCost' || condition.type === 'maxDevices'
}

/**
 * The design review report at the end of a brief (DESIGN_EXERCISES.md §1, §6): requirement results,
 * score, quotation, device counts, single points of failure and review hints. Pure.
 */
export class DesignReview {
  private readonly brief: DesignReviewBrief
  private readonly checker: RequirementChecker
  private readonly failures = new FailureScenarios()

  constructor(brief: DesignReviewBrief, options: RequirementCheckerOptions = {}) {
    this.brief = brief
    this.checker = new RequirementChecker(brief, options)
  }

  analyze(state: NetworkState): DesignReviewReport {
    const results = this.checker.check(state)
    const failed = new Set(results.filter((result) => !result.ok).map((result) => result.requirement.id))
    return {
      results,
      solved: failed.size === 0,
      score: DesignReview.score(results),
      cost: this.checker.inventory.cost(state),
      ...(this.brief.budget === undefined ? {} : { budget: this.brief.budget }),
      counts: this.checker.inventory.counts(state),
      singlePointsOfFailure: this.singlePointsOfFailure(state, results),
      hints: this.brief.reviewHints.filter((hint) => hint.requirementId === undefined || failed.has(hint.requirementId)),
    }
  }

  /**
   * Weighted score (weight absent = 1). Limits count only when every other requirement holds, so an
   * empty design does not earn the budget points.
   */
  static score(results: readonly RequirementResult[]): DesignScore {
    const networkWorks = results.every((result) => result.ok || isLimit(result.requirement.condition))
    let earned = 0
    let possible = 0
    for (const result of results) {
      const weight = result.requirement.weight ?? 1
      possible += weight
      if (result.ok && (networkWorks || !isLimit(result.requirement.condition))) earned += weight
    }
    return { earned, possible }
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
      const brokenMembers = this.checker.groups.memberIds(broken.flatMap((requirement) => conditionGroups(requirement.condition)))
      const access = this.failures.neighboursOf(settled, brokenMembers).has(device.id)
      spofs.push({ deviceId: device.id, breaks: broken.map((requirement) => requirement.id), access })
    }
    return spofs
  }
}
