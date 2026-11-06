// Recently added and favourite palette models, kept in localStorage. Storage may be missing or
// broken (private mode, quota): every failure is logged with console.warn and the palette keeps
// working with the in-memory copy, as the progress store does.

/** The part of the Web Storage API this store needs; injectable for tests. */
export type PaletteStorage = Pick<Storage, 'getItem' | 'setItem'>

export interface PaletteMemoryState {
  /** Model ids, most recently added first. */
  recent: readonly string[]
  /** Model ids in the order they were starred. */
  favourites: readonly string[]
}

const STORAGE_KEY = 'agArizaLab.palette.v1'
/** How many recently added models the palette remembers. */
export const RECENT_LIMIT = 8
/** Upper bound of stored favourites (the catalog is smaller; guards against junk data). */
const FAVOURITE_LIMIT = 100

const EMPTY: PaletteMemoryState = { recent: [], favourites: [] }

function idList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return []
  const ids = value.filter((item): item is string => typeof item === 'string' && item.length > 0)
  return [...new Set(ids)].slice(0, limit)
}

export class PaletteMemory {
  private readonly storage: PaletteStorage | null
  private state: PaletteMemoryState

  constructor(storage: PaletteStorage | null) {
    this.storage = storage
    this.state = this.load()
  }

  /** Store over the browser's localStorage, or a memory-only store when it is unavailable. */
  static fromBrowser(): PaletteMemory {
    try {
      return new PaletteMemory(window.localStorage)
    } catch (error) {
      console.warn('Palette storage is unavailable; recent devices and favourites are kept for this session only.', error)
      return new PaletteMemory(null)
    }
  }

  read(): PaletteMemoryState {
    return this.state
  }

  /** A model was added to the lab: it moves to the front of the recent list. */
  recordUse(modelId: string): PaletteMemoryState {
    const recent = [modelId, ...this.state.recent.filter((id) => id !== modelId)].slice(0, RECENT_LIMIT)
    return this.update({ ...this.state, recent })
  }

  /** Stars or unstars a model. */
  toggleFavourite(modelId: string): PaletteMemoryState {
    const starred = this.state.favourites.includes(modelId)
    const favourites = starred
      ? this.state.favourites.filter((id) => id !== modelId)
      : [...this.state.favourites, modelId].slice(0, FAVOURITE_LIMIT)
    return this.update({ ...this.state, favourites })
  }

  private update(next: PaletteMemoryState): PaletteMemoryState {
    this.state = next
    this.save()
    return next
  }

  private load(): PaletteMemoryState {
    if (!this.storage) return EMPTY
    let raw: string | null
    try {
      raw = this.storage.getItem(STORAGE_KEY)
    } catch (error) {
      console.warn('Saved palette data could not be read.', error)
      return EMPTY
    }
    if (raw === null) return EMPTY
    try {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null) return EMPTY
      const record = parsed as Record<string, unknown>
      return { recent: idList(record.recent, RECENT_LIMIT), favourites: idList(record.favourites, FAVOURITE_LIMIT) }
    } catch (error) {
      console.warn('Saved palette data is corrupt; ignored.', error)
      return EMPTY
    }
  }

  private save(): void {
    if (!this.storage) return
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.state))
    } catch (error) {
      console.warn('Palette data could not be saved.', error)
    }
  }
}
