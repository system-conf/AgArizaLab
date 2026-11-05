/** Saved result of one completed scenario. */
export interface ScenarioProgress {
  /** Fastest completion in whole seconds. */
  bestSeconds: number
  /** Fewest hints used in any completion. */
  hintsUsed: number
}

export type ProgressMap = Readonly<Record<string, ScenarioProgress>>

/** The part of the Web Storage API this store needs; injectable for tests. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

const STORAGE_KEY = 'agArizaLab.progress.v1'
const FORMAT_VERSION = 1

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/**
 * Completed scenarios kept in localStorage. Storage may be missing or broken
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
      console.warn('İlerleme kaydı kullanılamıyor; ilerleme yalnızca bu oturumda tutulacak.', error)
      return new ProgressStore(null)
    }
  }

  read(): ProgressMap {
    return this.progress
  }

  /** Merges a completion (keeps the best time and fewest hints) and saves it. */
  recordCompletion(scenarioId: string, seconds: number, hintsUsed: number): ProgressMap {
    const previous = this.progress[scenarioId]
    const next: ScenarioProgress = previous
      ? { bestSeconds: Math.min(previous.bestSeconds, seconds), hintsUsed: Math.min(previous.hintsUsed, hintsUsed) }
      : { bestSeconds: seconds, hintsUsed }
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
      console.warn('Kayıtlı ilerleme okunamadı.', error)
      return {}
    }
    if (raw === null) return {}
    try {
      return ProgressStore.parse(JSON.parse(raw))
    } catch (error) {
      console.warn('Kayıtlı ilerleme bozuk; yok sayıldı.', error)
      return {}
    }
  }

  private save(): void {
    if (!this.storage) return
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: FORMAT_VERSION, completed: this.progress }))
    } catch (error) {
      console.warn('İlerleme kaydedilemedi; yalnızca bu oturumda tutulacak.', error)
    }
  }

  /** Field-by-field validation; unknown shapes or entries are ignored with a warning. */
  private static parse(value: unknown): ProgressMap {
    if (!isRecord(value) || value.version !== FORMAT_VERSION || !isRecord(value.completed)) {
      console.warn('Kayıtlı ilerleme tanınmayan biçimde; yok sayıldı.')
      return {}
    }
    const result: Record<string, ScenarioProgress> = {}
    for (const [scenarioId, entry] of Object.entries(value.completed)) {
      if (isRecord(entry) && isCount(entry.bestSeconds) && isCount(entry.hintsUsed)) {
        result[scenarioId] = { bestSeconds: entry.bestSeconds, hintsUsed: entry.hintsUsed }
      } else {
        console.warn(`Kayıtlı ilerlemede geçersiz kayıt yok sayıldı: ${scenarioId}`)
      }
    }
    return result
  }
}
