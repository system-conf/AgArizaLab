import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProgressStore, type KeyValueStorage } from './ProgressStore'

const key = 'agArizaLab.progress.v1'

class MemoryStorage implements KeyValueStorage {
  readonly items = new Map<string, string>()

  getItem(name: string): string | null {
    return this.items.get(name) ?? null
  }

  setItem(name: string, value: string): void {
    this.items.set(name, value)
  }
}

const brokenStorage: KeyValueStorage = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('quota')
  },
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ProgressStore', () => {
  it('starts empty and persists completions', () => {
    const storage = new MemoryStorage()
    const store = new ProgressStore(storage)
    expect(store.read()).toEqual({})
    store.recordCompletion('posGateway', 120, 2)
    expect(new ProgressStore(storage).read()).toEqual({ posGateway: { bestSeconds: 120, hintsUsed: 2 } })
  })

  it('keeps the best time and the fewest hints', () => {
    const store = new ProgressStore(new MemoryStorage())
    store.recordCompletion('posGateway', 120, 0)
    expect(store.recordCompletion('posGateway', 90, 3)).toEqual({ posGateway: { bestSeconds: 90, hintsUsed: 0 } })
  })

  it('works in memory without storage', () => {
    const store = new ProgressStore(null)
    store.recordCompletion('wrongDns', 30, 1)
    expect(store.read()).toEqual({ wrongDns: { bestSeconds: 30, hintsUsed: 1 } })
  })

  it('warns and keeps working when storage throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const store = new ProgressStore(brokenStorage)
    expect(store.read()).toEqual({})
    store.recordCompletion('kitchenVlan', 50, 0)
    expect(store.read()).toEqual({ kitchenVlan: { bestSeconds: 50, hintsUsed: 0 } })
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('ignores invalid JSON with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const storage = new MemoryStorage()
    storage.setItem(key, '{not json')
    expect(new ProgressStore(storage).read()).toEqual({})
    expect(warn).toHaveBeenCalledOnce()
  })

  it('ignores an unknown shape with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const storage = new MemoryStorage()
    storage.setItem(key, JSON.stringify({ version: 99, completed: {} }))
    expect(new ProgressStore(storage).read()).toEqual({})
    storage.setItem(key, JSON.stringify(['posGateway']))
    expect(new ProgressStore(storage).read()).toEqual({})
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('keeps valid entries and drops invalid ones field by field', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const storage = new MemoryStorage()
    storage.setItem(
      key,
      JSON.stringify({
        version: 1,
        completed: {
          posGateway: { bestSeconds: 61, hintsUsed: 1, extra: 'x' },
          printerDhcp: { bestSeconds: '61', hintsUsed: 1 },
          cameraSubnet: { bestSeconds: -5, hintsUsed: 0 },
          wrongDns: null,
        },
      }),
    )
    expect(new ProgressStore(storage).read()).toEqual({ posGateway: { bestSeconds: 61, hintsUsed: 1 } })
    expect(warn).toHaveBeenCalledTimes(3)
  })
})
