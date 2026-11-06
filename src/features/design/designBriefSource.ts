// The design briefs the app offers (authored by D3 in src/scenarios/design, texts in `designBriefs`).
// Only the lazily loaded design screens import this module, so the briefs stay out of the main chunk.
import type { DesignExerciseDefinition } from '../../domain'
import { designExercises } from '../../scenarios/design'

export const designBriefDefinitions: readonly DesignExerciseDefinition[] = designExercises
