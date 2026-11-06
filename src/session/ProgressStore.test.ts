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
  it('starts empty and persists completions in the v2 format', () => {
    const storage = new MemoryStorage()
    const store = new ProgressStore(storage)
    expect(store.read()).toEqual({})
    store.recordCompletion('posGateway', 2)
    expect(new ProgressStore(storage).read()).toEqual({ posGateway: { guideStepsUsed: 2 } })
    expect(JSON.parse(storage.getItem(key) ?? 'null')).toEqual({ version: 2, completed: { posGateway: { guideStepsUsed: 2 } } })
  })

  it('keeps the fewest guide steps', () => {
    const store = new ProgressStore(new MemoryStorage())
    store.recordCompletion('posGateway', 0)
    expect(store.recordCompletion('posGateway', 3)).toEqual({ posGateway: { guideStepsUsed: 0 } })
    expect(store.recordCompletion('wrongDns', 3)).toEqual({ posGateway: { guideStepsUsed: 0 }, wrongDns: { guideStepsUsed: 3 } })
  })

  it('works in memory without storage', () => {
    const store = new ProgressStore(null)
    store.recordCompletion('wrongDns', 1)
    expect(store.read()).toEqual({ wrongDns: { guideStepsUsed: 1 } })
  })

  it('warns and keeps working when storage throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const store = new ProgressStore(brokenStorage)
    expect(store.read()).toEqual({})
    store.recordCompletion('kitchenVlan', 0)
    expect(store.read()).toEqual({ kitchenVlan: { guideStepsUsed: 0 } })
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

  it('migrates v1 progress (timer era): keeps completions and hints as guide steps, drops the time', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      key,
      JSON.stringify({ version: 1, completed: { posGateway: { bestSeconds: 61, hintsUsed: 1 }, wrongDns: { bestSeconds: 30, hintsUsed: 0 } } }),
    )
    const store = new ProgressStore(storage)
    expect(store.read()).toEqual({ posGateway: { guideStepsUsed: 1 }, wrongDns: { guideStepsUsed: 0 } })
    store.recordCompletion('posGateway', 2)
    expect(JSON.parse(storage.getItem(key) ?? 'null')).toEqual({
      version: 2,
      completed: { posGateway: { guideStepsUsed: 1 }, wrongDns: { guideStepsUsed: 0 } },
    })
  })

  it('keeps valid v1 entries and drops invalid ones field by field', () => {
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
    expect(new ProgressStore(storage).read()).toEqual({ posGateway: { guideStepsUsed: 1 } })
    expect(warn).toHaveBeenCalledTimes(3)
  })

  it('keeps valid v2 entries and drops invalid ones', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const storage = new MemoryStorage()
    storage.setItem(
      key,
      JSON.stringify({ version: 2, completed: { posGateway: { guideStepsUsed: 2 }, wrongDns: { guideStepsUsed: 1.5 }, kitchenVlan: {} } }),
    )
    expect(new ProgressStore(storage).read()).toEqual({ posGateway: { guideStepsUsed: 2 } })
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('stores prototype-like exercise ids as plain entries', () => {
    const storage = new MemoryStorage()
    storage.setItem(key, '{"version":2,"completed":{"__proto__":{"guideStepsUsed":1}}}')
    const store = new ProgressStore(storage)
    const loaded = store.read()
    expect(Object.getPrototypeOf(loaded)).toBe(Object.prototype)
    expect(Object.getOwnPropertyDescriptor(loaded, '__proto__')?.value).toEqual({ guideStepsUsed: 1 })
    const recorded = store.recordCompletion('constructor', 3)
    expect(Object.getOwnPropertyDescriptor(recorded, 'constructor')?.value).toEqual({ guideStepsUsed: 3 })
    expect(Object.getPrototypeOf(recorded)).toBe(Object.prototype)
  })
})
