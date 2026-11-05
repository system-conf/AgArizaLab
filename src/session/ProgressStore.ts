/** Saved result of one solved exercise. */
export interface ScenarioProgress {
  /** Fewest guide steps used in any successful verification. */
  guideStepsUsed: number
}

export type ProgressMap = Readonly<Record<string, ScenarioProgress>>

/** The part of the Web Storage API this store needs; injectable for tests. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

/** Same key as v1 so existing progress is found; the stored `version` tells the formats apart. */
const STORAGE_KEY = 'agArizaLab.progress.v1'
/**
 * v1: `{ bestSeconds, hintsUsed }` per exercise (timer era).
 * v2: `{ guideStepsUsed }` per exercise. v1 data is migrated on load (time is dropped).
 */
const FORMAT_VERSION = 2

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/** Reads one stored entry of the given format version; null when it is invalid. */
function parseEntry(entry: unknown, version: 1 | 2): ScenarioProgress | null {
  if (!isRecord(entry)) return null
  if (version === 1) {
    return isCount(entry.bestSeconds) && isCount(entry.hintsUsed) ? { guideStepsUsed: entry.hintsUsed } : null
  }
  return isCount(entry.guideStepsUsed) ? { guideStepsUsed: entry.guideStepsUsed } : null
}

/**
 * Solved exercises kept in localStorage. Storage may be missing or broken
 * (private mode, quota, blocked cookies): every failure is logged with
 * console.warn and the app keeps working with the in-memory copy.
 */
export class ProgressStore {
  private readonly storage: KeyValueStorage | null
  private progress: ProgressMap

  constructor(storage: KeyValueStorage | null) {
    this.storage = storage
    this.progress = this.load()
  }

  /** Store over the browser's localStorage, or a memory-only store when it is unavailable. */
  static fromBrowser(): ProgressStore {
    try {
      return new ProgressStore(window.localStorage)
    } catch (error) {
      console.warn('Progress storage is unavailable; progress is kept for this session only.', error)
      return new ProgressStore(null)
    }
  }

  read(): ProgressMap {
    return this.progress
  }

  /** Merges a successful verification (keeps the fewest guide steps) and saves it. */
  recordCompletion(scenarioId: string, guideStepsUsed: number): ProgressMap {
    const previous = this.progress[scenarioId]
    const next: ScenarioProgress = {
      guideStepsUsed: previous ? Math.min(previous.guideStepsUsed, guideStepsUsed) : guideStepsUsed,
    }
    this.progress = { ...this.progress, [scenarioId]: next }
    this.save()
    return this.progress
  }

  private load(): ProgressMap {
    if (!this.storage) return {}
    let raw: string | null
    try {
      raw = this.storage.getItem(STORAGE_KEY)
    } catch (error) {
      console.warn('Saved progress could not be read.', error)
      return {}
    }
    if (raw === null) return {}
    try {
      return ProgressStore.parse(JSON.parse(raw))
    } catch (error) {
      console.warn('Saved progress is corrupt; ignored.', error)
      return {}
    }
  }

  private save(): void {
    if (!this.storage) return
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: FORMAT_VERSION, completed: this.progress }))
    } catch (error) {
      console.warn('Progress could not be saved; it is kept for this session only.', error)
    }
  }

  /** Field-by-field validation of v1 or v2 data; unknown shapes or entries are ignored with a warning. */
  private static parse(value: unknown): ProgressMap {
    const version = isRecord(value) ? value.version : undefined
    if (!isRecord(value) || (version !== 1 && version !== 2) || !isRecord(value.completed)) {
      console.warn('Saved progress has an unknown format; ignored.')
      return {}
    }
    const result: Record<string, ScenarioProgress> = {}
    for (const [scenarioId, entry] of Object.entries(value.completed)) {
      const parsed = parseEntry(entry, version)
      if (parsed) {
        result[scenarioId] = parsed
      } else {
        console.warn(`Invalid saved progress entry ignored: ${scenarioId}`)
      }
    }
    return result
  }
}
