/** Colour band of the budget meter: well within, close to the limit, over budget. */
export type BudgetTone = 'ok' | 'near' | 'over'

export interface BudgetMeterView {
  cost: number
  budget: number
  /** Budget left (0 when over). */
  remaining: number
  /** Amount over the budget (0 when within). */
  overBy: number
  /** Filled share of the bar, 0..100 (capped at 100 when over). */
  percent: number
  tone: BudgetTone
}

/** From this share of the budget on, the meter turns amber. */
export const BUDGET_NEAR_RATIO = 0.85

/** Model of the budget meter: the cost of the learner's additions against the brief's budget. */
export class BudgetMeter {
  /** Null when the brief has no budget (no meter is shown). */
  static of(cost: number, budget: number | undefined): BudgetMeterView | null {
    if (budget === undefined) return null
    const ratio = budget > 0 ? cost / budget : cost > 0 ? Infinity : 0
    const tone: BudgetTone = cost > budget ? 'over' : ratio >= BUDGET_NEAR_RATIO ? 'near' : 'ok'
    return {
      cost,
      budget,
      remaining: Math.max(0, budget - cost),
      overBy: Math.max(0, cost - budget),
      percent: Math.min(100, Math.round(ratio * 100)),
      tone,
    }
  }
}
