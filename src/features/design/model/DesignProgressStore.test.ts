import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KeyValueStorage } from '../../../session/ProgressStore'
import { DesignProgressStore } from './DesignProgressStore'

const KEY = 'agArizaLab.designProgress.v1'

class MemoryStorage implements KeyValueStorage {
  readonly items = new Map<string, string>()
  getItem(key: string): string | null {
    return this.items.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value)
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DesignProgressStore', () => {
  it('records submissions under its own key; solved stays solved', () => {
    const storage = new MemoryStorage()
    const store = new DesignProgressStore(storage)
    expect(store.read()).toEqual({})
    expect(store.recordSubmission('smallOffice', false)).toEqual({ smallOffice: { solved: false } })
    expect(store.recordSubmission('smallOffice', true)).toEqual({ smallOffice: { solved: true } })
    expect(store.recordSubmission('smallOffice', false)).toEqual({ smallOffice: { solved: true } })
    expect(storage.items.has('agArizaLab.progress.v1')).toBe(false)
    expect(new DesignProgressStore(storage).read()).toEqual({ smallOffice: { solved: true } })
  })

  it('ignores corrupt data and invalid entries with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const storage = new MemoryStorage()
    storage.setItem(KEY, '{not json')
    expect(new DesignProgressStore(storage).read()).toEqual({})
    storage.setItem(KEY, JSON.stringify({ version: 1, briefs: { ok: { solved: true }, bad: { solved: 'yes' }, __proto__: { solved: true } } }))
    expect(new DesignProgressStore(storage).read()).toEqual({ ok: { solved: true } })
    storage.setItem(KEY, JSON.stringify({ version: 99, briefs: {} }))
    expect(new DesignProgressStore(storage).read()).toEqual({})
    expect(warn).toHaveBeenCalled()
  })

  it('keeps working in memory when storage fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      },
    }
    const store = new DesignProgressStore(broken)
    expect(store.recordSubmission('restaurant', true)).toEqual({ restaurant: { solved: true } })
    expect(warn).toHaveBeenCalledTimes(2)
    expect(new DesignProgressStore(null).read()).toEqual({})
  })
})
