import { describe, expect, it, vi } from 'vitest'
import { LocalDataEraser, PROGRESS_KINDS, PROGRESS_STORAGE_KEYS } from './LocalDataEraser'

class MapStorage {
  readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

function filledStorage(): MapStorage {
  const storage = new MapStorage()
  for (const key of Object.values(PROGRESS_STORAGE_KEYS)) storage.setItem(key, '{}')
  storage.setItem('agArizaLab.preferences', '{}')
  storage.setItem('agArizaLab.language', 'tr')
  storage.setItem('agArizaLab.palette.v1', '{}')
  storage.setItem('otherApp.token', 'keep')
  return storage
}

describe('LocalDataEraser', () => {
  it('knows the storage key of every progress kind', () => {
    expect(PROGRESS_STORAGE_KEYS).toEqual({
      exercises: 'agArizaLab.progress.v1',
      designs: 'agArizaLab.designProgress.v1',
      samples: 'agArizaLab.samples.progress',
    })
    expect(PROGRESS_KINDS).toEqual(['exercises', 'designs', 'samples'])
  })

  it('resets only the chosen progress kinds', () => {
    const storage = filledStorage()
    const eraser = new LocalDataEraser(storage, () => Promise.resolve())
    expect(eraser.resetProgress(['exercises', 'samples'])).toEqual({ ok: true })
    expect([...storage.values.keys()]).toEqual([
      'agArizaLab.designProgress.v1',
      'agArizaLab.preferences',
      'agArizaLab.language',
      'agArizaLab.palette.v1',
      'otherApp.token',
    ])
  })

  it('clears every app key and the saved labs, but not other keys', async () => {
    const storage = filledStorage()
    const clearLabs = vi.fn(() => Promise.resolve())
    const eraser = new LocalDataEraser(storage, clearLabs)
    expect(await eraser.clearAll()).toEqual({ ok: true })
    expect([...storage.values.keys()]).toEqual(['otherApp.token'])
    expect(clearLabs).toHaveBeenCalledOnce()
  })

  it('still clears local storage when the labs cannot be cleared, and reports the failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const storage = filledStorage()
    const failure = new Error('blocked')
    const eraser = new LocalDataEraser(storage, () => Promise.reject(failure))
    expect(await eraser.clearAll()).toEqual({ ok: false, error: failure })
    expect([...storage.values.keys()]).toEqual(['otherApp.token'])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('reports a broken storage instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const broken = {
      length: 0,
      key: () => null,
      removeItem: () => {
        throw new Error('SecurityError')
      },
    }
    expect(new LocalDataEraser(broken, () => Promise.resolve()).resetProgress(['designs']).ok).toBe(false)
    warn.mockRestore()
  })

  it('works without storage at all', async () => {
    const eraser = new LocalDataEraser(null, () => Promise.resolve())
    expect(eraser.resetProgress(['exercises'])).toEqual({ ok: true })
    expect(await eraser.clearAll()).toEqual({ ok: true })
  })
})
