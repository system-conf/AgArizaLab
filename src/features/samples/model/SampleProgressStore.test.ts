import { afterEach, describe, expect, it, vi } from 'vitest'
import { SAMPLE_PROGRESS_STORAGE_KEY } from '../../../samples'
import { officeSample } from '../../../samples/contract/testSamples'
import type { KeyValueStorage } from '../../../session/ProgressStore'
import { SampleProgressStore } from './SampleProgressStore'

class MemoryStorage implements KeyValueStorage {
  readonly items = new Map<string, string>()
  writes = 0
  getItem(key: string): string | null {
    return this.items.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.writes += 1
    this.items.set(key, value)
  }
}

const NOW = new Date('2026-11-06T10:00:00Z')

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SampleProgressStore', () => {
  it('saves changes under the sample progress key and reads them back', () => {
    const storage = new MemoryStorage()
    const store = new SampleProgressStore(storage)
    const sample = officeSample()
    expect(store.read().of(sample.id)).toBeUndefined()
    const book = store.update((current) => current.withStepsDone(sample, ['watchArp'], NOW))
    expect(book.isDone(sample.id, 'watchArp')).toBe(true)
    expect(store.read()).toBe(book)
    expect(storage.items.has(SAMPLE_PROGRESS_STORAGE_KEY)).toBe(true)
    expect(new SampleProgressStore(storage).read().isDone(sample.id, 'watchArp')).toBe(true)
  })

  it('does not write when a change changes nothing', () => {
    const storage = new MemoryStorage()
    const store = new SampleProgressStore(storage)
    const before = store.read()
    expect(store.update((book) => book.withReset('officeBasics'))).toBe(before)
    expect(storage.writes).toBe(0)
  })

  it('keeps working in memory when the storage fails', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('full')
      },
    }
    const store = new SampleProgressStore(broken)
    const sample = officeSample()
    expect(store.update((book) => book.withStepsDone(sample, ['watchArp'], NOW)).isDone(sample.id, 'watchArp')).toBe(true)
    expect(console.warn).toHaveBeenCalledTimes(2)
  })

  it('starts empty without storage and with corrupt data', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(new SampleProgressStore(null).read().toData()).toEqual({ version: 1, samples: {} })
    const storage = new MemoryStorage()
    storage.items.set(SAMPLE_PROGRESS_STORAGE_KEY, '{not json')
    expect(new SampleProgressStore(storage).read().toData()).toEqual({ version: 1, samples: {} })
  })
})
