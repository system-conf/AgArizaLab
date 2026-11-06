import type { KeyValueStorage } from '../../../session/ProgressStore'

/** Saved state of one design brief: a design was submitted; `solved` once every requirement held. */
export interface DesignProgress {
  solved: boolean
}

export type DesignProgressMap = Readonly<Record<string, DesignProgress>>

/** Separate from the troubleshooting progress (`agArizaLab.progress.v1`). */
const STORAGE_KEY = 'agArizaLab.designProgress.v1'
const FORMAT_VERSION = 1

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Submitted design briefs kept in localStorage (same pattern as ProgressStore): storage may be
 * missing or broken, every failure is logged with console.warn and the in-memory copy is used.
 */
export class DesignProgressStore {
  private readonly storage: KeyValueStorage | null
  private progress: DesignProgressMap

  constructor(storage: KeyValueStorage | null) {
    this.storage = storage
    this.progress = this.load()
  }

  /** Store over the browser's localStorage, or a memory-only store when it is unavailable. */
  static fromBrowser(): DesignProgressStore {
    try {
      return new DesignProgressStore(window.localStorage)
    } catch (error) {
      console.warn('Design progress storage is unavailable; progress is kept for this session only.', error)
      return new DesignProgressStore(null)
    }
  }

  read(): DesignProgressMap {
    return this.progress
  }

  /** Records a submitted design; a brief once solved stays solved. */
  recordSubmission(briefId: string, solved: boolean): DesignProgressMap {
    const previous = Object.hasOwn(this.progress, briefId) ? this.progress[briefId] : undefined
    this.progress = { ...this.progress, [briefId]: { solved: solved || (previous?.solved ?? false) } }
    this.save()
    return this.progress
  }

  private load(): DesignProgressMap {
    if (!this.storage) return {}
    let raw: string | null
    try {
      raw = this.storage.getItem(STORAGE_KEY)
    } catch (error) {
      console.warn('Saved design progress could not be read.', error)
      return {}
    }
    if (raw === null) return {}
    try {
      return DesignProgressStore.parse(JSON.parse(raw))
    } catch (error) {
      console.warn('Saved design progress is corrupt; ignored.', error)
      return {}
    }
  }

  private save(): void {
    if (!this.storage) return
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: FORMAT_VERSION, briefs: this.progress }))
    } catch (error) {
      console.warn('Design progress could not be saved; it is kept for this session only.', error)
    }
  }

  private static parse(value: unknown): DesignProgressMap {
    if (!isRecord(value) || value.version !== FORMAT_VERSION || !isRecord(value.briefs)) {
      console.warn('Saved design progress has an unknown format; ignored.')
      return {}
    }
    // Object.fromEntries defines own properties, so a stored `__proto__` key never reaches the prototype.
    const entries: [string, DesignProgress][] = []
    for (const [briefId, entry] of Object.entries(value.briefs)) {
      if (isRecord(entry) && typeof entry.solved === 'boolean') entries.push([briefId, { solved: entry.solved }])
      else console.warn(`Invalid saved design progress entry ignored: ${briefId}`)
    }
    return Object.fromEntries(entries)
  }
}
