import type { DesignCondition } from '../domain'
import type { RequirementResult } from './RequirementChecker'

export interface DesignScore {
  earned: number
  possible: number
}

/** Limits (budget, device counts) only earn points once the network itself works. */
export function isLimit(condition: DesignCondition): boolean {
  return condition.type === 'maxCost' || condition.type === 'maxDevices'
}

/** Weighted scoring of the review (weight absent = 1). */
export class ReviewScoring {
  /** Points each result earned, in the order given. A met limit earns nothing while a network requirement fails. */
  static points(results: readonly RequirementResult[]): number[] {
    const networkWorks = ReviewScoring.networkWorks(results)
    return results.map((result) => (result.ok && (networkWorks || !isLimit(result.requirement.condition)) ? ReviewScoring.weight(result) : 0))
  }

  static score(results: readonly RequirementResult[]): DesignScore {
    const points = ReviewScoring.points(results)
    return {
      earned: points.reduce((sum, value) => sum + value, 0),
      possible: results.reduce((sum, result) => sum + ReviewScoring.weight(result), 0),
    }
  }

  /** Every requirement except the limits holds. */
  static networkWorks(results: readonly RequirementResult[]): boolean {
    return results.every((result) => result.ok || isLimit(result.requirement.condition))
  }

  static weight(result: RequirementResult): number {
    return result.requirement.weight ?? 1
  }

  /** Earned share in whole percent (0 when nothing can be earned). */
  static percent(score: DesignScore): number {
    return score.possible === 0 ? 0 : Math.round((score.earned / score.possible) * 100)
  }
}
