import { SAMPLE_PROGRESS_STORAGE_KEY, SampleProgressBook } from '../../../samples'
import type { KeyValueStorage } from '../../../session/ProgressStore'

/**
 * The learner's sample progress (SampleProgressBook) in localStorage, same pattern as the other
 * progress stores: storage may be missing or broken, every failure is logged with console.warn and
 * the in-memory book is used for the session.
 */
export class SampleProgressStore {
  private readonly storage: KeyValueStorage | null
  private book: SampleProgressBook

  constructor(storage: KeyValueStorage | null) {
    this.storage = storage
    this.book = this.load()
  }

  /** Store over the browser's localStorage, or a memory-only store when it is unavailable. */
  static fromBrowser(): SampleProgressStore {
    try {
      return new SampleProgressStore(window.localStorage)
    } catch (error) {
      console.warn('Sample progress storage is unavailable; progress is kept for this session only.', error)
      return new SampleProgressStore(null)
    }
  }

  read(): SampleProgressBook {
    return this.book
  }

  /** Applies a change; saves and returns the new book (the same book when nothing changed). */
  update(change: (book: SampleProgressBook) => SampleProgressBook): SampleProgressBook {
    const next = change(this.book)
    if (next === this.book) return next
    this.book = next
    this.save()
    return next
  }

  private load(): SampleProgressBook {
    if (!this.storage) return SampleProgressBook.empty()
    try {
      return SampleProgressBook.fromJson(this.storage.getItem(SAMPLE_PROGRESS_STORAGE_KEY))
    } catch (error) {
      console.warn('Saved sample progress could not be read.', error)
      return SampleProgressBook.empty()
    }
  }

  private save(): void {
    if (!this.storage) return
    try {
      this.storage.setItem(SAMPLE_PROGRESS_STORAGE_KEY, this.book.toJson())
    } catch (error) {
      console.warn('Sample progress could not be saved; it is kept for this session only.', error)
    }
  }
}
