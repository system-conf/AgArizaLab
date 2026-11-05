// Brings any supported lab input up to LAB_SCHEMA_VERSION before validation (MODEL_V2 §9):
// - no `schemaVersion`: a v1 network ({ devices, links }) or v1 exercise ({ initialState, … }),
//   checked with the v1 schemas and upgraded by src/lab/migrations;
// - `schemaVersion` n < current: the steps n → n+1 → … of LAB_MIGRATION_STEPS;
// - `schemaVersion` > current: refused with `lab:import.unsupportedVersion`.
import { LAB_SCHEMA_VERSION } from '../domain/v2'
import type { LocalizedMessage } from '../domain/Messages'
import { localizedMessage } from '../i18n/messageKeys'
import { createLabFromExercise, createLabFromState } from './createLab'
import { LabMessages } from './LabMessages'
import { migrateV1Exercise, migrateV1Layout, migrateV1ToV2 } from './migrations'
import { v1NetworkStateSchema, v1ScenarioDefinitionSchema } from './schemas/v1Schemas'

/** One upgrade of a raw lab document from `from` to `from + 1` (it sets the new schemaVersion). */
export interface LabMigrationStep {
  from: number
  migrate(raw: Readonly<Record<string, unknown>>): Record<string, unknown>
}

/** Format upgrades of stored labs. Empty while 2 is the only lab format (a 2 → 3 step goes here). */
export const LAB_MIGRATION_STEPS: readonly LabMigrationStep[] = []

/** Where a document came from: 'v1' (network / exercise), an older schemaVersion, or null = current. */
export type LabOrigin = 'v1' | number | null

export type LabUpgrade = { ok: true; raw: unknown; origin: LabOrigin } | { ok: false; errors: LocalizedMessage[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function failure(message: LocalizedMessage): LabUpgrade {
  return { ok: false, errors: [message] }
}

export class LabMigrationChain {
  private readonly messages = new LabMessages()
  private readonly steps: readonly LabMigrationStep[]
  private readonly clock: () => Date

  constructor(steps: readonly LabMigrationStep[] = LAB_MIGRATION_STEPS, clock: () => Date = () => new Date()) {
    this.steps = steps
    this.clock = clock
  }

  upgrade(input: unknown): LabUpgrade {
    if (!isRecord(input)) return failure(localizedMessage('lab:import.notALab'))
    if (!('schemaVersion' in input)) return this.upgradeV1(input)
    const version = input.schemaVersion
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      return failure(localizedMessage('lab:import.invalidVersion', { version: String(version) }))
    }
    if (version > LAB_SCHEMA_VERSION) {
      return failure(localizedMessage('lab:import.unsupportedVersion', { version, supported: LAB_SCHEMA_VERSION }))
    }
    return this.applySteps(input, version)
  }

  private applySteps(input: Record<string, unknown>, from: number): LabUpgrade {
    let raw = input
    for (let version = from; version < LAB_SCHEMA_VERSION; version += 1) {
      const step = this.steps.find((candidate) => candidate.from === version)
      if (!step) return failure(localizedMessage('lab:import.invalidVersion', { version: String(from) }))
      try {
        raw = step.migrate(raw)
      } catch (error) {
        return failure(localizedMessage('lab:import.migrationFailed', { version, detail: errorDetail(error) }))
      }
    }
    return { ok: true, raw, origin: from === LAB_SCHEMA_VERSION ? null : from }
  }

  private upgradeV1(input: Record<string, unknown>): LabUpgrade {
    const now = this.clock()
    if ('initialState' in input) {
      const parsed = v1ScenarioDefinitionSchema.safeParse(input)
      if (!parsed.success) return { ok: false, errors: this.messages.fromIssues(input, parsed.error.issues) }
      return this.runV1(() => createLabFromExercise(migrateV1Exercise(parsed.data), { title: parsed.data.id, now }))
    }
    if ('devices' in input && 'links' in input) {
      const parsed = v1NetworkStateSchema.safeParse(input)
      if (!parsed.success) return { ok: false, errors: this.messages.fromIssues(input, parsed.error.issues) }
      return this.runV1(() => createLabFromState(migrateV1ToV2(parsed.data), migrateV1Layout(parsed.data), { now }))
    }
    return failure(localizedMessage('lab:import.notALab'))
  }

  /** The v1 migration throws on data it cannot place (V1MigrationError); that becomes a message. */
  private runV1(migrate: () => unknown): LabUpgrade {
    try {
      return { ok: true, raw: migrate(), origin: 'v1' }
    } catch (error) {
      return failure(localizedMessage('lab:import.migrationFailed', { version: 1, detail: errorDetail(error) }))
    }
  }
}
