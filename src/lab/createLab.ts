// Factories for new lab documents. Titles are user content: '' means "untitled" and the UI shows
// `lab:untitled` for it (pure code never picks a display text).
import { LAB_SCHEMA_VERSION, type ExerciseDefinition, type LabDocument, type LabLayout, type NetworkStateV2 } from '../domain/v2'

export interface CreateLabOptions {
  title?: string
  /** Creation time (tests inject a fixed date). */
  now?: Date
}

function labOf(state: NetworkStateV2, layout: LabLayout, options: CreateLabOptions): LabDocument {
  const timestamp = (options.now ?? new Date()).toISOString()
  return {
    schemaVersion: LAB_SCHEMA_VERSION,
    meta: { title: options.title ?? '', createdAt: timestamp, updatedAt: timestamp },
    state,
    layout,
    notes: '',
    annotations: [],
  }
}

/** A lab without devices, links, notes or annotations. */
export function createEmptyLab(title = '', now: Date = new Date()): LabDocument {
  return labOf({ devices: [], links: [] }, { devices: {} }, { title, now })
}

/**
 * A free lab from an exercise's network and canvas (v1 exercises: pass `migrateV1Exercise(def)`).
 * Locks and solve conditions are not part of a lab; the exercise screen keeps the definition.
 * Pass a localized `Exercise` to get localized device names; the title defaults to ''.
 */
export function createLabFromExercise(exercise: ExerciseDefinition, options: CreateLabOptions = {}): LabDocument {
  return labOf(exercise.lab.state, exercise.lab.layout, options)
}

/** A lab from a network and an optional canvas (missing positions are left to the workspace). */
export function createLabFromState(state: NetworkStateV2, layout: LabLayout, options: CreateLabOptions = {}): LabDocument {
  return labOf(state, layout, options)
}
