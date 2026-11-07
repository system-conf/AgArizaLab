// Preferences → Data: reset progress and clear everything the app keeps in this browser.
import { STORAGE_KEY as DESIGN_PROGRESS_KEY } from '../../design/model/DesignProgressStore'
import { SAMPLE_PROGRESS_STORAGE_KEY } from '../../../samples/contract/sampleCatalogue'
import { STORAGE_KEY as EXERCISE_PROGRESS_KEY } from '../../../session/ProgressStore'

/** Kinds of progress the Data tab can reset, in the order it lists them. */
export type ProgressKind = 'exercises' | 'designs' | 'samples'

export const PROGRESS_KINDS: readonly ProgressKind[] = ['exercises', 'designs', 'samples']

/** localStorage key of each kind's progress. */
export const PROGRESS_STORAGE_KEYS: Readonly<Record<ProgressKind, string>> = {
  exercises: EXERCISE_PROGRESS_KEY,
  designs: DESIGN_PROGRESS_KEY,
  samples: SAMPLE_PROGRESS_STORAGE_KEY,
}

/** Every localStorage key of the app starts with this (progress, preferences, language, palette, …). */
export const APP_STORAGE_PREFIX = 'agArizaLab.'

/** The part of the Web Storage API the eraser needs; injectable for tests. */
export type ErasableStorage = Pick<Storage, 'length' | 'key' | 'removeItem'>

export type EraseResult = { ok: true } | { ok: false; error: unknown }

/**
 * Removes stored data on request (docs/PREFERENCES.md §6). Storage may be missing or broken: failures are
 * logged and reported, never thrown. The caller reloads the page afterwards, because stores that live in
 * memory (progress, preferences, the open lab) would otherwise keep their old values.
 */
export class LocalDataEraser {
  private readonly storage: ErasableStorage | null
  private readonly clearLabs: () => Promise<void>

  constructor(storage: ErasableStorage | null, clearLabs: () => Promise<void>) {
    this.storage = storage
    this.clearLabs = clearLabs
  }

  /** Forgets the progress of the given kinds; labs and preferences stay. */
  resetProgress(kinds: readonly ProgressKind[]): EraseResult {
    try {
      for (const kind of kinds) this.storage?.removeItem(PROGRESS_STORAGE_KEYS[kind])
      return { ok: true }
    } catch (error) {
      console.warn('Progress could not be reset.', error)
      return { ok: false, error }
    }
  }

  /** Every `agArizaLab.*` localStorage key and every saved lab (IndexedDB). Other sites' data is untouched. */
  async clearAll(): Promise<EraseResult> {
    let failure: unknown = null
    try {
      for (const key of this.appKeys()) this.storage?.removeItem(key)
    } catch (error) {
      console.warn('Local storage could not be cleared.', error)
      failure = error
    }
    try {
      await this.clearLabs()
    } catch (error) {
      console.warn('Saved labs could not be cleared.', error)
      failure ??= error
    }
    return failure === null ? { ok: true } : { ok: false, error: failure }
  }

  private appKeys(): string[] {
    const storage = this.storage
    if (!storage) return []
    const keys: string[] = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key !== null && key.startsWith(APP_STORAGE_PREFIX)) keys.push(key)
    }
    return keys
  }
}
