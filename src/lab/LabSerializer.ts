// Reads and writes lab files (.agl.json, autosave, share links). Loading = JSON → migration chain
// (v1 / older formats → current) → zod schema → StateInvariants. Every failure is a list of `lab:`
// messages; nothing throws for bad input.
import { StateInvariants, type LabDocument } from '../domain'
import type { LocalizedMessage } from '../domain/Messages'
import { localizedMessage } from '../i18n/messageKeys'
import { LabMessages } from './LabMessages'
import { LabMigrationChain, type LabOrigin } from './LabMigrationChain'
import { labDocumentSchema } from './schemas/labDocumentSchema'

export type LabParseResult =
  | { ok: true; doc: LabDocument; origin: LabOrigin }
  | { ok: false; errors: LocalizedMessage[] }

/** Keys written first, in this order; all other keys follow alphabetically. */
const LEADING_KEYS = ['schemaVersion', 'meta', 'state', 'layout', 'notes', 'annotations', 'id']

function compareKeys(x: string, y: string): number {
  const rankX = LEADING_KEYS.indexOf(x)
  const rankY = LEADING_KEYS.indexOf(y)
  if (rankX !== -1 || rankY !== -1) {
    return (rankX === -1 ? LEADING_KEYS.length : rankX) - (rankY === -1 ? LEADING_KEYS.length : rankY)
  }
  return x < y ? -1 : x > y ? 1 : 0
}

/** Same data with object keys in a fixed order, so equal documents serialize to equal text. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (typeof value !== 'object' || value === null) return value
  const entries = Object.entries(value).filter(([, item]) => item !== undefined)
  entries.sort(([x], [y]) => compareKeys(x, y))
  return Object.fromEntries(entries.map(([key, item]) => [key, canonical(item)]))
}

export class LabSerializer {
  private readonly chain: LabMigrationChain
  private readonly invariants = new StateInvariants()
  private readonly messages = new LabMessages()

  constructor(chain: LabMigrationChain = new LabMigrationChain()) {
    this.chain = chain
  }

  /** `input`: file text / JSON string, or already parsed JSON (IndexedDB value, test data). */
  parse(input: unknown): LabParseResult {
    let json: unknown = input
    if (typeof input === 'string') {
      try {
        json = JSON.parse(input)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        return { ok: false, errors: [localizedMessage('lab:import.notJson', { detail })] }
      }
    }
    const upgraded = this.chain.upgrade(json)
    if (!upgraded.ok) return upgraded
    const parsed = labDocumentSchema.safeParse(upgraded.raw)
    if (!parsed.success) return { ok: false, errors: this.messages.fromIssues(upgraded.raw, parsed.error.issues) }
    const violations = this.invariants.violations(parsed.data.state)
    if (violations.length > 0) return { ok: false, errors: this.messages.fromViolations(violations) }
    return { ok: true, doc: parsed.data, origin: upgraded.origin }
  }

  /** Pretty, stable JSON (2-space indent, fixed key order, trailing newline) for files. */
  serialize(doc: LabDocument): string {
    return `${JSON.stringify(canonical(doc), null, 2)}\n`
  }

  /** Stable JSON without whitespace (share links). */
  serializeCompact(doc: LabDocument): string {
    return JSON.stringify(canonical(doc))
  }
}

/** Shared instance for UI code. */
export const labSerializer = new LabSerializer()
