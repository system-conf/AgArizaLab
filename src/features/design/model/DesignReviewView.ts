import type { LocalizedMessage } from '../../../domain/Messages'
import type { CostSummary, DesignReviewReport, KindCount, ReviewedRequirement, ReviewHintText } from '../../../design'
import { BudgetMeter, type BudgetMeterView } from './BudgetMeter'

export interface ReviewSpofRow {
  deviceId: string
  deviceName: string
  /** Access device (switch / AP the members are plugged into) rather than a core device. */
  access: boolean
  /** Why it matters and what to do (access device: expected; core device: add redundancy). */
  explanation: LocalizedMessage
  /** Requirements that stop holding while the device is down. */
  breaks: { id: string; description: LocalizedMessage }[]
}

export interface DesignReviewViewModel {
  solved: boolean
  /** Weighted score in whole percent. */
  percent: number
  /** "8 of 11 requirements are met." */
  verdict: LocalizedMessage
  /** "Score: 9 / 12 (75%)" */
  scoreText: LocalizedMessage
  /** Every requirement (acceptance tests included) with status, progress and notes. */
  requirements: ReviewedRequirement[]
  /** Acceptance tests (hidden requirements) among them. */
  hiddenCount: number
  cost: CostSummary
  /** Budget meter; null without a budget. */
  budget: BudgetMeterView | null
  budgetMessage: LocalizedMessage
  provided: number
  added: number
  devicesByKind: KindCount[]
  singlePointsOfFailure: ReviewSpofRow[]
  /** Hints that apply, with their texts. */
  hints: ReviewHintText[]
  /** Hints are shown at once (design solved); otherwise only when the learner asks. */
  hintsRevealed: boolean
}

/** Turns a DesignReviewReport into what the review screen shows (budget meter, requirement texts of the single points of failure). */
export class DesignReviewView {
  static build(report: DesignReviewReport): DesignReviewViewModel {
    const descriptions = new Map(report.results.map((result) => [result.requirement.id, result.description]))
    return {
      solved: report.solved,
      percent: report.scorePercent,
      verdict: report.verdict,
      scoreText: report.scoreText,
      requirements: report.requirements,
      hiddenCount: report.requirements.filter((requirement) => requirement.hidden).length,
      cost: report.cost,
      budget: BudgetMeter.of(report.cost.total, report.budget),
      budgetMessage: report.budgetReview.message,
      provided: report.counts.provided,
      added: report.counts.added,
      devicesByKind: report.devicesByKind,
      singlePointsOfFailure: report.singlePointsOfFailure.map((spof) => ({
        deviceId: spof.deviceId,
        deviceName: spof.deviceName,
        access: spof.access,
        explanation: spof.explanation,
        breaks: spof.breaks.flatMap((id) => {
          const description = descriptions.get(id)
          return description === undefined ? [] : [{ id, description }]
        }),
      })),
      hints: report.hintTexts,
      hintsRevealed: report.hintsRevealed,
    }
  }
}
