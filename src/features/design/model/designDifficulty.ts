import type { DesignExerciseDefinition } from '../../../domain'
import type { DifficultyLevel } from '../../scenario/scenarioDifficulty'

/** Requirement points up to which a brief counts as easy / medium (above: hard). */
const EASY_UP_TO = 11
const MEDIUM_UP_TO = 15

/**
 * UI-only difficulty of a brief, derived from its data (briefs carry no difficulty field): one point
 * per requirement, two more per `survivesFailure` (redundancy), one for a budget.
 */
export function designDifficultyOf(brief: Pick<DesignExerciseDefinition, 'requirements' | 'budget'>): DifficultyLevel {
  const redundancy = brief.requirements.filter((requirement) => requirement.condition.type === 'survivesFailure').length
  const points = brief.requirements.length + 2 * redundancy + (brief.budget === undefined ? 0 : 1)
  if (points <= EASY_UP_TO) return 'easy'
  return points <= MEDIUM_UP_TO ? 'medium' : 'hard'
}
