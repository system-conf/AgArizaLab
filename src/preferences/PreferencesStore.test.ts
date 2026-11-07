import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PREFERENCES } from './preferencesModel'
import {
  LEGACY_SNAP_STORAGE_KEY,
  PREFERENCES_STORAGE_KEY,
  PreferencesStore,
  type PreferencesStorage,
  type PreferencesStorageEvent,
} from './PreferencesStore'
import { memoryStorage } from './testStorage'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PreferencesStore', () => {
  it('starts with the defaults and saves only what changed', () => {
    const storage = memoryStorage()
    const store = new PreferencesStore(storage)
    expect(store.getSnapshot()).toBe(DEFAULT_PREFERENCES)
    store.set('map.minimap', false)
    expect(JSON.parse(storage.values.get(PREFERENCES_STORAGE_KEY) ?? '')).toEqual({ version: 1, map: { minimap: false } })
    expect(new PreferencesStore(storage).get('map.minimap')).toBe(false)
  })

  it('removes the record when everything is back to default', () => {
    const storage = memoryStorage()
    const store = new PreferencesStore(storage)
    store.update({ appearance: { theme: 'dark' }, terminal: { historyLength: 50 } })
    store.reset()
    expect(storage.values.has(PREFERENCES_STORAGE_KEY)).toBe(false)
    expect(store.getSnapshot()).toEqual(DEFAULT_PREFERENCES)
  })

  it('keeps valid stored fields when others are invalid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = memoryStorage({ [PREFERENCES_STORAGE_KEY]: '{"version":1,"map":{"grid":false,"snap":"on"}}' })
    const store = new PreferencesStore(storage)
    expect(store.get('map.grid')).toBe(false)
    expect(store.get('map.snap')).toBe(false)
    expect(warn).toHaveBeenCalledWith('Ignored invalid stored preferences: map.snap')
  })

  it.each([
    ['on', true],
    ['off', false],
  ])('migrates the old snap key (%s) and removes it', (legacy, snap) => {
    const storage = memoryStorage({ [LEGACY_SNAP_STORAGE_KEY]: legacy })
    const store = new PreferencesStore(storage)
    expect(store.get('map.snap')).toBe(snap)
    expect(storage.values.has(LEGACY_SNAP_STORAGE_KEY)).toBe(false)
    expect(new PreferencesStore(storage).get('map.snap')).toBe(snap)
  })

  it('lets an existing record win over the old snap key', () => {
    const storage = memoryStorage({
      [PREFERENCES_STORAGE_KEY]: '{"version":1,"map":{"grid":false}}',
      [LEGACY_SNAP_STORAGE_KEY]: 'on',
    })
    expect(new PreferencesStore(storage).get('map.snap')).toBe(false)
    expect(storage.values.has(LEGACY_SNAP_STORAGE_KEY)).toBe(false)
  })

  it('notifies subscribers once per change and not for a no-op', () => {
    const store = new PreferencesStore(memoryStorage())
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.update({ map: { grid: false, minimap: false } })
    store.set('map.grid', false)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    store.set('map.grid', true)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('follows another tab without writing back', () => {
    const storage = memoryStorage()
    const store = new PreferencesStore(storage)
    const listeners = new Set<(event: PreferencesStorageEvent) => void>()
    const disconnect = store.listenToOtherTabs({
      addEventListener: (_type, listener) => void listeners.add(listener),
      removeEventListener: (_type, listener) => void listeners.delete(listener),
    })
    const listener = vi.fn()
    store.subscribe(listener)
    const fire = (event: PreferencesStorageEvent) => listeners.forEach((handle) => handle(event))

    fire({ key: 'agArizaLab.progress', newValue: '{}' })
    expect(listener).not.toHaveBeenCalled()
    fire({ key: PREFERENCES_STORAGE_KEY, newValue: '{"version":1,"appearance":{"theme":"dark"}}' })
    expect(store.get('appearance.theme')).toBe('dark')
    expect(storage.values.has(PREFERENCES_STORAGE_KEY)).toBe(false)
    fire({ key: null, newValue: null })
    expect(store.get('appearance.theme')).toBe('light')
    expect(listener).toHaveBeenCalledTimes(2)
    disconnect()
    expect(listeners.size).toBe(0)
  })

  it('exports and imports preferences', () => {
    const source = new PreferencesStore(memoryStorage())
    source.update({ simulation: { speed: 2, defaultEventFilters: ['icmp'] }, data: { autosave: false } })
    const target = new PreferencesStore(memoryStorage())
    target.set('map.grid', false)
    expect(target.importJson(source.exportJson())).toMatchObject({ ok: true, ignored: [] })
    expect(target.getSnapshot()).toEqual(source.getSnapshot())
    expect(target.get('map.grid')).toBe(true)
  })

  it('leaves the preferences alone when an import fails', () => {
    const store = new PreferencesStore(memoryStorage())
    store.set('map.grid', false)
    expect(store.importJson('{"devices":[]}')).toEqual({ ok: false, reason: 'notPreferences' })
    expect(store.get('map.grid')).toBe(false)
  })

  it('keeps working in memory when storage fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken: PreferencesStorage = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    }
    const store = new PreferencesStore(broken)
    expect(() => store.set('map.snap', true)).not.toThrow()
    expect(store.get('map.snap')).toBe(true)
    expect(new PreferencesStore(null).get('map.snap')).toBe(false)
    expect(warn).toHaveBeenCalledTimes(3)
  })
})
