import type { z } from 'zod'
import {
  DEFAULT_PREFERENCES,
  PREFERENCE_FIELDS,
  PREFERENCE_SECTIONS,
  PREFERENCES_VERSION,
  preferencesSchema,
  type PreferencePath,
  type PreferenceSection,
  type Preferences,
  type PreferencesPatch,
  type PreferenceValue,
} from './preferencesModel'

/** Marks an exported preferences file so that other JSON files are not imported by mistake. */
export const PREFERENCES_FILE_KIND = 'agArizaLab.preferences'

/** A parse result: the preferences plus the paths whose stored value was present but invalid. */
export interface ParsedPreferences {
  readonly preferences: Preferences
  /** 'section.field' (or 'section' when the whole section was not an object); empty when all was valid. */
  readonly ignored: readonly string[]
}

export type PreferencesImportResult =
  | ({ readonly ok: true } & ParsedPreferences)
  | { readonly ok: false; readonly reason: 'invalidJson' | 'notPreferences' }

type JsonRecord = Readonly<Record<string, unknown>>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Turns stored or imported JSON into Preferences and back (docs/PREFERENCES.md §2). Parsing is lenient:
 * every field is checked on its own, an invalid or missing field takes its default and the valid ones
 * are kept, so one bad value never resets the rest. Storage keeps only the fields that differ from the
 * defaults, so a later change of a default reaches everyone who never chose that field.
 */
export class PreferencesCodec {
  /** Lenient parse of an already decoded value (any shape). */
  static parse(raw: unknown): ParsedPreferences {
    const source = isRecord(raw) ? PreferencesCodec.migrate(raw) : {}
    const ignored: string[] = []
    const result: Record<string, Record<string, unknown>> = {}
    for (const section of PREFERENCE_SECTIONS) {
      const input = source[section]
      if (input !== undefined && !isRecord(input)) ignored.push(section)
      const values = isRecord(input) ? input : {}
      const fields: Readonly<Record<string, z.ZodType>> = PREFERENCE_FIELDS[section]
      const defaults: JsonRecord = DEFAULT_PREFERENCES[section]
      const out: Record<string, unknown> = {}
      for (const [key, schema] of Object.entries(fields)) {
        const parsed = schema.safeParse(values[key])
        if (parsed.success) out[key] = parsed.data
        else {
          out[key] = defaults[key]
          if (values[key] !== undefined) ignored.push(`${section}.${key}`)
        }
      }
      result[section] = out
    }
    // Every field is valid now; a failure here is a programmer error (an invalid default).
    return { preferences: preferencesSchema.parse(result), ignored }
  }

  /** Lenient parse of the stored text; null (nothing stored) gives the defaults. */
  static parseStored(text: string | null): ParsedPreferences {
    if (text === null) return { preferences: DEFAULT_PREFERENCES, ignored: [] }
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch (error) {
      console.warn('Stored preferences are not valid JSON; the defaults are used.', error)
      return { preferences: DEFAULT_PREFERENCES, ignored: [] }
    }
    return PreferencesCodec.parse(raw)
  }

  /** The text kept in storage: the version plus the fields that differ from the defaults. */
  static toStored(preferences: Preferences): string {
    return JSON.stringify({ version: PREFERENCES_VERSION, ...PreferencesCodec.overrides(preferences) })
  }

  /** A complete, readable file for "export preferences". */
  static toExportFile(preferences: Preferences): string {
    return JSON.stringify({ kind: PREFERENCES_FILE_KIND, version: PREFERENCES_VERSION, ...preferences }, null, 2)
  }

  /** Reads an exported file (or a stored record). Fields it does not name take their defaults. */
  static fromImportFile(text: string): PreferencesImportResult {
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return { ok: false, reason: 'invalidJson' }
    }
    if (!isRecord(raw)) return { ok: false, reason: 'notPreferences' }
    const kindMatches = raw.kind === undefined || raw.kind === PREFERENCES_FILE_KIND
    const hasSection = PREFERENCE_SECTIONS.some((section) => isRecord(raw[section]))
    if (!kindMatches || (raw.kind === undefined && !hasSection)) return { ok: false, reason: 'notPreferences' }
    return { ok: true, ...PreferencesCodec.parse(raw) }
  }

  /** Per section, only the fields whose value differs from the default (empty sections left out). */
  static overrides(preferences: Preferences): Partial<Record<PreferenceSection, JsonRecord>> {
    const result: Partial<Record<PreferenceSection, JsonRecord>> = {}
    for (const section of PREFERENCE_SECTIONS) {
      const values: JsonRecord = preferences[section]
      const defaults: JsonRecord = DEFAULT_PREFERENCES[section]
      const changed = Object.entries(values).filter(([key, value]) => !sameJson(value, defaults[key]))
      if (changed.length > 0) result[section] = Object.fromEntries(changed)
    }
    return result
  }

  static get<P extends PreferencePath>(preferences: Preferences, path: P): PreferenceValue<P> {
    const [section, key] = PreferencesCodec.split(path)
    const values: JsonRecord = preferences[section]
    // The path type ties `key` to a field of `section`, so the value has the field's type.
    return values[key] as PreferenceValue<P>
  }

  /**
   * `preferences` with the patch applied. Throws on a value the schema rejects: callers pass typed
   * values, so this is a programmer error (or a value that slipped past a cast).
   */
  static apply(preferences: Preferences, patch: PreferencesPatch): Preferences {
    const merged: Record<string, unknown> = { ...preferences }
    for (const section of PREFERENCE_SECTIONS) {
      const change = patch[section]
      if (change !== undefined) merged[section] = { ...preferences[section], ...change }
    }
    const { preferences: next, ignored } = PreferencesCodec.parse(merged)
    if (ignored.length > 0) throw new Error(`Invalid preference value: ${ignored.join(', ')}`)
    return PreferencesCodec.share(preferences, next)
  }

  /** A patch that sets one path. */
  static patchOf<P extends PreferencePath>(path: P, value: PreferenceValue<P>): PreferencesPatch {
    const [section, key] = PreferencesCodec.split(path)
    return { [section]: { [key]: value } }
  }

  /**
   * `next` reusing the section objects of `previous` that did not change, so subscribers to an
   * unchanged section (or array field) see the same object and do not re-render.
   */
  static share(previous: Preferences, next: Preferences): Preferences {
    if (sameJson(previous, next)) return previous
    const pick = <S extends PreferenceSection>(section: S): Preferences[S] =>
      sameJson(previous[section], next[section]) ? previous[section] : next[section]
    return {
      appearance: pick('appearance'),
      map: pick('map'),
      simulation: pick('simulation'),
      terminal: pick('terminal'),
      cables: pick('cables'),
      data: pick('data'),
    }
  }

  private static split(path: PreferencePath): [PreferenceSection, string] {
    const dot = path.indexOf('.')
    const section = path.slice(0, dot)
    const found = PREFERENCE_SECTIONS.find((candidate) => candidate === section)
    if (found === undefined || dot < 0) throw new Error(`Unknown preference path: ${path}`)
    return [found, path.slice(dot + 1)]
  }

  /** Upgrades an older stored record to the current shape. Version 1 is the first; nothing to do yet. */
  private static migrate(raw: JsonRecord): JsonRecord {
    return raw
  }
}
