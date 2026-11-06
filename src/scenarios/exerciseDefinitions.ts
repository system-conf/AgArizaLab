// The five exercises as v2 ExerciseDefinitions: the v1 data migrated with migrateV1Exercise until
// the exercises are rewritten as v2 data (PLAN_V2 wave 2.2). Imported by the exercise screen only
// (lazy chunk), so the migration code stays out of the landing chunk.
import type { ExerciseDefinition, ExerciseLock } from '../domain/v2'
import { migrateV1Exercise } from '../lab/migrations'
import { scenarioDefinitions } from './scenarioDefinitions'

/**
 * Locks of every v1 exercise: like in v1 the network is given — devices and cables cannot be
 * added, deleted or moved; settings, power, plugging cables and the terminal stay free.
 */
export const V1_EXERCISE_LOCKS: readonly ExerciseLock[] = [{ scope: 'topology' }]

export const exerciseDefinitions: readonly ExerciseDefinition[] = scenarioDefinitions.map((definition) => {
  const migrated = migrateV1Exercise(definition)
  return { ...migrated, locks: [...migrated.locks, ...V1_EXERCISE_LOCKS] }
})
