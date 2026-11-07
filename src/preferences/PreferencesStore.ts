import { PreferencesCodec, type PreferencesImportResult } from './PreferencesCodec'
import {
  DEFAULT_PREFERENCES,
  type PreferencePath,
  type Preferences,
  type PreferencesPatch,
  type PreferenceValue,
} from './preferencesModel'

/** localStorage key of the preferences record (also read by the theme script in index.html). */
export const PREFERENCES_STORAGE_KEY = 'agArizaLab.preferences'
/** Before preferences existed, snap to grid was kept here ('on' / 'off'); migrated and removed on load. */
export const LEGACY_SNAP_STORAGE_KEY = 'agArizaLab.workspace.snap'

/** The part of the Web Storage API the store needs; injectable for tests. */
export type PreferencesStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** What the browser's 'storage' event carries that the store reads. */
export interface PreferencesStorageEvent {
  readonly key: string | null
  readonly newValue: string | null
}

/** A window (or a test double) that fires 'storage' when another tab changes localStorage. */
export interface StorageEventSource {
  addEventListener(type: 'storage', listener: (event: PreferencesStorageEvent) => void): void
  removeEventListener(type: 'storage', listener: (event: PreferencesStorageEvent) => void): void
}

type Listener = () => void

/**
 * The user's preferences, kept in localStorage (docs/PREFERENCES.md §3). Storage may be missing or broken
 * (private mode, quota): failures are logged with console.warn and the preferences are kept for the
 * session. Snapshots are immutable and keep their identity until something changes, so the getters fit
 * React's useSyncExternalStore directly.
 */
export class PreferencesStore {
  private readonly storage: PreferencesStorage | null
  private readonly listeners = new Set<Listener>()
  private current: Preferences

  constructor(storage: PreferencesStorage | null) {
    this.storage = storage
    this.current = this.load()
  }

  /** Store over the browser's localStorage, or a memory-only store when it is unavailable. */
  static fromBrowser(): PreferencesStore {
    try {
      return new PreferencesStore(window.localStorage)
    } catch (error) {
      console.warn('Preference storage is unavailable; preferences are kept for this session only.', error)
      return new PreferencesStore(null)
    }
  }

  /** The current preferences (same object until a change). Bound: pass it around freely. */
  readonly getSnapshot = (): Preferences => this.current

  /** Calls `listener` after every change (own or from another tab); returns the unsubscribe. Bound. */
  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  get<P extends PreferencePath>(path: P): PreferenceValue<P> {
    return PreferencesCodec.get(this.current, path)
  }

  set<P extends PreferencePath>(path: P, value: PreferenceValue<P>): void {
    this.update(PreferencesCodec.patchOf(path, value))
  }

  /** Applies several fields at once (one save, one notification). Throws on an invalid value. */
  update(patch: PreferencesPatch): void {
    this.commit(PreferencesCodec.apply(this.current, patch))
  }

  /** Back to the defaults; the stored record is removed. */
  reset(): void {
    this.commit(PreferencesCodec.share(this.current, DEFAULT_PREFERENCES))
  }

  /** A complete JSON file of the current preferences (Data tab: export). */
  exportJson(): string {
    return PreferencesCodec.toExportFile(this.current)
  }

  /**
   * Replaces the preferences with an exported file (Data tab: import). Fields the file does not name
   * take their defaults; invalid ones too, and they are listed in `ignored` so the UI can say so.
   */
  importJson(text: string): PreferencesImportResult {
    const result = PreferencesCodec.fromImportFile(text)
    if (result.ok) this.commit(PreferencesCodec.share(this.current, result.preferences))
    return result
  }

  /** Follows changes made in other tabs; returns the disconnect. */
  listenToOtherTabs(source: StorageEventSource): () => void {
    const listener = (event: PreferencesStorageEvent) => this.handleStorageEvent(event)
    source.addEventListener('storage', listener)
    return () => source.removeEventListener('storage', listener)
  }

  /** Another tab wrote (or cleared) the record: adopt it without writing it back. */
  handleStorageEvent(event: PreferencesStorageEvent): void {
    // key null: the other tab called localStorage.clear().
    if (event.key !== PREFERENCES_STORAGE_KEY && event.key !== null) return
    const { preferences } = PreferencesCodec.parseStored(event.newValue)
    this.publish(PreferencesCodec.share(this.current, preferences))
  }

  private commit(next: Preferences): void {
    if (next === this.current) return
    this.save(next)
    this.publish(next)
  }

  private publish(next: Preferences): void {
    if (next === this.current) return
    this.current = next
    for (const listener of [...this.listeners]) listener()
  }

  private load(): Preferences {
    const stored = this.read(PREFERENCES_STORAGE_KEY)
    const { preferences, ignored } = PreferencesCodec.parseStored(stored)
    if (ignored.length > 0) console.warn(`Ignored invalid stored preferences: ${ignored.join(', ')}`)
    const legacySnap = this.read(LEGACY_SNAP_STORAGE_KEY)
    if (legacySnap === null) return preferences
    // The new record wins once it exists; the legacy key only seeds a first record.
    const migrated = stored === null ? PreferencesCodec.apply(preferences, { map: { snap: legacySnap === 'on' } }) : preferences
    this.save(migrated)
    this.remove(LEGACY_SNAP_STORAGE_KEY)
    return migrated
  }

  private read(key: string): string | null {
    if (!this.storage) return null
    try {
      return this.storage.getItem(key)
    } catch (error) {
      console.warn('Could not read the stored preferences; the defaults are used.', error)
      return null
    }
  }

  private save(preferences: Preferences): void {
    if (!this.storage) return
    const overrides = PreferencesCodec.overrides(preferences)
    try {
      if (Object.keys(overrides).length === 0) this.storage.removeItem(PREFERENCES_STORAGE_KEY)
      else this.storage.setItem(PREFERENCES_STORAGE_KEY, PreferencesCodec.toStored(preferences))
    } catch (error) {
      console.warn('Could not save the preferences; they are kept for this session only.', error)
    }
  }

  private remove(key: string): void {
    if (!this.storage) return
    try {
      this.storage.removeItem(key)
    } catch (error) {
      console.warn('Could not remove an old preference key.', error)
    }
  }
}
