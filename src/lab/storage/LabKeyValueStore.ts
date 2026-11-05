// Key-value persistence for labs: IndexedDB (idb-keyval) with an in-memory fallback. Storage can be
// missing or broken (private mode, quota, blocked storage); the app must keep working, so the
// resilient store logs the first failure with console.warn and continues in memory.
import { createStore, del, get, set, type UseStore } from 'idb-keyval'

export interface LabKeyValueStore {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
}

export class MemoryKeyValueStore implements LabKeyValueStore {
  private readonly values = new Map<string, unknown>()

  get(key: string): Promise<unknown> {
    return Promise.resolve(this.values.get(key))
  }

  set(key: string, value: unknown): Promise<void> {
    this.values.set(key, value)
    return Promise.resolve()
  }

  delete(key: string): Promise<void> {
    this.values.delete(key)
    return Promise.resolve()
  }
}

/** One IndexedDB object store, opened on first use. */
export class IdbKeyValueStore implements LabKeyValueStore {
  private readonly databaseName: string
  private readonly storeName: string
  private store: UseStore | null = null

  constructor(databaseName: string, storeName: string) {
    this.databaseName = databaseName
    this.storeName = storeName
  }

  get(key: string): Promise<unknown> {
    return this.withStore((store) => get<unknown>(key, store))
  }

  set(key: string, value: unknown): Promise<void> {
    return this.withStore((store) => set(key, value, store))
  }

  delete(key: string): Promise<void> {
    return this.withStore((store) => del(key, store))
  }

  private async withStore<Result>(action: (store: UseStore) => Promise<Result>): Promise<Result> {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available')
    this.store ??= createStore(this.databaseName, this.storeName)
    return action(this.store)
  }
}

/** Uses `primary` until it fails once, then `fallback` for the rest of the session. */
export class ResilientKeyValueStore implements LabKeyValueStore {
  private readonly primary: LabKeyValueStore
  private readonly fallback: LabKeyValueStore
  private failed = false

  constructor(primary: LabKeyValueStore, fallback: LabKeyValueStore = new MemoryKeyValueStore()) {
    this.primary = primary
    this.fallback = fallback
  }

  /** true once storage failed: labs live only in memory (UI may show `lab:storage.unavailable`). */
  get usingFallback(): boolean {
    return this.failed
  }

  get(key: string): Promise<unknown> {
    return this.run((store) => store.get(key))
  }

  set(key: string, value: unknown): Promise<void> {
    return this.run((store) => store.set(key, value))
  }

  delete(key: string): Promise<void> {
    return this.run((store) => store.delete(key))
  }

  private async run<Result>(action: (store: LabKeyValueStore) => Promise<Result>): Promise<Result> {
    if (!this.failed) {
      try {
        return await action(this.primary)
      } catch (error) {
        console.warn('Lab storage is not available; labs are kept in memory only.', error)
        this.failed = true
      }
    }
    return action(this.fallback)
  }
}
