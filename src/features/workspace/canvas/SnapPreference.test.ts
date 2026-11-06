import { describe, expect, it, vi } from 'vitest'
import { SNAP_STORAGE_KEY, SnapPreference, type SnapStorage } from './SnapPreference'

function memoryStorage(): SnapStorage & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value) }
}

describe('SnapPreference', () => {
  it('starts off and remembers the choice', () => {
    const storage = memoryStorage()
    const preference = new SnapPreference(storage)
    expect(preference.read()).toBe(false)
    preference.write(true)
    expect(storage.values.get(SNAP_STORAGE_KEY)).toBe('on')
    expect(new SnapPreference(storage).read()).toBe(true)
    preference.write(false)
    expect(new SnapPreference(storage).read()).toBe(false)
  })

  it('keeps working when storage fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken: SnapStorage = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
    }
    const preference = new SnapPreference(broken)
    expect(preference.read()).toBe(false)
    expect(() => preference.write(true)).not.toThrow()
    expect(new SnapPreference(null).read()).toBe(false)
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
})
