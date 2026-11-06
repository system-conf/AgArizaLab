// Whether finished moves snap to the grid, kept in localStorage until a Preferences screen exists.
// Storage may be missing or broken (private mode, quota): failures are logged with console.warn and the
// choice is kept for the session, as the palette memory does.

/** The part of the Web Storage API this store needs; injectable for tests. */
export type SnapStorage = Pick<Storage, 'getItem' | 'setItem'>

export const SNAP_STORAGE_KEY = 'agArizaLab.workspace.snap'

export class SnapPreference {
  private readonly storage: SnapStorage | null

  constructor(storage: SnapStorage | null) {
    this.storage = storage
  }

  /** Store over the browser's localStorage, or a memory-only store when it is unavailable. */
  static fromBrowser(): SnapPreference {
    try {
      return new SnapPreference(window.localStorage)
    } catch (error) {
      console.warn('Snap preference storage is unavailable; the choice is kept for this session only.', error)
      return new SnapPreference(null)
    }
  }

  /** The stored choice; off when nothing (or something unreadable) is stored. */
  read(): boolean {
    if (!this.storage) return false
    try {
      return this.storage.getItem(SNAP_STORAGE_KEY) === 'on'
    } catch (error) {
      console.warn('Could not read the snap preference; snapping starts off.', error)
      return false
    }
  }

  write(snap: boolean): void {
    if (!this.storage) return
    try {
      this.storage.setItem(SNAP_STORAGE_KEY, snap ? 'on' : 'off')
    } catch (error) {
      console.warn('Could not save the snap preference; it is kept for this session only.', error)
    }
  }
}
