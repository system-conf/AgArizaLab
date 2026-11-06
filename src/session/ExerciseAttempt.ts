import type { LocalizedMessage } from '../domain/Messages'
import type { ExerciseDefinition, NetworkStateV2, SolveConditionV2 } from '../domain/v2'
import { solveCheckerV2, type ConditionResultV2 } from '../engine'
import { FailedCheckDescriber } from './FailedCheckDescriber'

/** Evaluates solve conditions (SolveCheckerV2); injectable for tests. */
export interface ConditionChecker {
  check(state: NetworkStateV2, conditions: readonly SolveConditionV2[]): ConditionResultV2[]
}

/** Every exercise has three guide steps: direction → location → answer. */
export const GUIDE_STEPS = 3

interface AttemptData {
  guideStepsRevealed: number
  lastCheck: readonly ConditionResultV2[] | null
  /** Set by the first successful verification and never cleared. */
  solved: boolean
}

/**
 * The learner's progress in one open exercise, next to its lab (the network lives in the lab
 * document): guide steps shown, the latest verification and whether it was ever solved.
 * Immutable: every change returns a new attempt.
 */
export class ExerciseAttempt {
  private readonly solvedWhen: readonly SolveConditionV2[]
  private readonly checker: ConditionChecker
  private readonly data: AttemptData

  private constructor(solvedWhen: readonly SolveConditionV2[], checker: ConditionChecker, data: AttemptData) {
    this.solvedWhen = solvedWhen
    this.checker = checker
    this.data = data
  }

  static start(exercise: Pick<ExerciseDefinition, 'solvedWhen'>, checker: ConditionChecker = solveCheckerV2): ExerciseAttempt {
    return new ExerciseAttempt(exercise.solvedWhen, checker, { guideStepsRevealed: 0, lastCheck: null, solved: false })
  }

  get guideStepsRevealed(): number {
    return this.data.guideStepsRevealed
  }

  get isSolved(): boolean {
    return this.data.solved
  }

  /** Result of the latest verification; null before the first one. */
  get lastCheck(): readonly ConditionResultV2[] | null {
    return this.data.lastCheck
  }

  revealGuideStep(): ExerciseAttempt {
    if (this.data.guideStepsRevealed >= GUIDE_STEPS) return this
    return this.with({ guideStepsRevealed: this.data.guideStepsRevealed + 1 })
  }

  /** Checks the solve conditions on `state`; a success marks the attempt solved. */
  verify(state: NetworkStateV2): ExerciseAttempt {
    const results = this.checker.check(state, this.solvedWhen)
    return this.with({ lastCheck: results, solved: this.data.solved || results.every((result) => result.ok) })
  }

  /** Symptoms of the conditions that failed in the latest verification (names from `state`). */
  failedChecks(state: NetworkStateV2): LocalizedMessage[] {
    return this.data.lastCheck === null ? [] : FailedCheckDescriber.describeFailures(state, this.data.lastCheck)
  }

  private with(changes: Partial<AttemptData>): ExerciseAttempt {
    return new ExerciseAttempt(this.solvedWhen, this.checker, { ...this.data, ...changes })
  }
}
