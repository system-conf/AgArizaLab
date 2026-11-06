import { afterEach, describe, expect, it, vi } from 'vitest'
import { PaletteMemory, RECENT_LIMIT, type PaletteStorage } from './PaletteMemory'

class MapStorage implements PaletteStorage {
  readonly values = new Map<string, string>()
  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

const KEY = 'agArizaLab.palette.v1'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PaletteMemory', () => {
  it('starts empty and keeps the most recent model first without duplicates', () => {
    const memory = new PaletteMemory(new MapStorage())
    expect(memory.read()).toEqual({ recent: [], favourites: [] })
    memory.recordUse('pc')
    memory.recordUse('switch8')
    expect(memory.recordUse('pc').recent).toEqual(['pc', 'switch8'])
  })

  it('remembers at most RECENT_LIMIT models', () => {
    const memory = new PaletteMemory(null)
    for (let index = 0; index < RECENT_LIMIT + 3; index += 1) memory.recordUse(`model${index}`)
    expect(memory.read().recent).toHaveLength(RECENT_LIMIT)
    expect(memory.read().recent[0]).toBe(`model${RECENT_LIMIT + 2}`)
  })

  it('toggles favourites in starring order', () => {
    const memory = new PaletteMemory(null)
    memory.toggleFavourite('pc')
    expect(memory.toggleFavourite('router2Port').favourites).toEqual(['pc', 'router2Port'])
    expect(memory.toggleFavourite('pc').favourites).toEqual(['router2Port'])
  })

  it('persists and reloads both lists', () => {
    const storage = new MapStorage()
    const memory = new PaletteMemory(storage)
    memory.recordUse('pc')
    memory.toggleFavourite('switch24Poe')
    expect(new PaletteMemory(storage).read()).toEqual({ recent: ['pc'], favourites: ['switch24Poe'] })
  })

  it('ignores corrupt or malformed data with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const storage = new MapStorage()
    storage.setItem(KEY, '{not json')
    expect(new PaletteMemory(storage).read()).toEqual({ recent: [], favourites: [] })
    expect(warn).toHaveBeenCalledOnce()
    storage.setItem(KEY, JSON.stringify({ recent: ['pc', 7, 'pc', ''], favourites: 'x' }))
    expect(new PaletteMemory(storage).read()).toEqual({ recent: ['pc'], favourites: [] })
  })

  it('keeps working in memory when the storage throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const broken: PaletteStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      },
    }
    const memory = new PaletteMemory(broken)
    expect(memory.recordUse('pc').recent).toEqual(['pc'])
    expect(warn).toHaveBeenCalledTimes(2)
  })
})
