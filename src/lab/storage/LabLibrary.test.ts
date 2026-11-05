import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmptyLab } from '../createLab'
import { LabEditor } from '../LabEditor'
import { expectLabMessage, FIXED_NOW, sampleLab } from '../testLabs'
import { LabAutosaver, type DelayScheduler } from './LabAutosaver'
import { IdbKeyValueStore, MemoryKeyValueStore, ResilientKeyValueStore, type LabKeyValueStore } from './LabKeyValueStore'
import { LabLibrary, MAX_RECENT_LABS, newLabId } from './LabLibrary'
import { LabSerializer } from '../LabSerializer'

const editor = new LabEditor()
const LATER = new Date('2026-11-07T08:30:00.000Z')

function library(store: LabKeyValueStore = new MemoryKeyValueStore(), now: Date = LATER): LabLibrary {
  return new LabLibrary(store, new LabSerializer(), () => now)
}

class FailingStore implements LabKeyValueStore {
  get(): Promise<unknown> {
    return Promise.reject(new Error('blocked'))
  }
  set(): Promise<void> {
    return Promise.reject(new Error('blocked'))
  }
  delete(): Promise<void> {
    return Promise.reject(new Error('blocked'))
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LabLibrary', () => {
  it('saves, lists and reopens labs, newest first, stamping updatedAt', async () => {
    const labs = library()
    const doc = sampleLab()
    const stored = await labs.save('labA', doc)
    expect(stored.meta.updatedAt).toBe(LATER.toISOString())
    expect(stored.meta.createdAt).toBe(FIXED_NOW.toISOString())
    await labs.save('labB', createEmptyLab('İkinci', FIXED_NOW))
    expect(await labs.listRecent()).toEqual([
      { id: 'labB', title: 'İkinci', updatedAt: LATER.toISOString() },
      { id: 'labA', title: 'Ofis ağı', updatedAt: LATER.toISOString() },
    ])
    expect(await labs.open('labA')).toEqual({ ok: true, doc: stored, origin: null })
    const missing = await labs.open('ghost')
    expect(missing.ok).toBe(false)
    if (!missing.ok) expectLabMessage(missing.errors[0], 'lab:recent.notFound')
  })

  it('loads the last saved lab as autosave and forgets it when deleted', async () => {
    const labs = library()
    expect(await labs.loadAutosave()).toBeNull()
    await labs.save('labA', sampleLab())
    const edited = editor.renameDevice(sampleLab(), 'pc', 'Kasa')
    await labs.save('labA', edited)
    const restored = await labs.loadAutosave()
    expect(restored?.labId).toBe('labA')
    expect(restored?.doc.state.devices[0]?.name).toBe('Kasa')
    expect(await labs.listRecent()).toHaveLength(1)
    await labs.remove('labA')
    expect(await labs.loadAutosave()).toBeNull()
    expect(await labs.listRecent()).toEqual([])
  })

  it('keeps only the most recent labs', async () => {
    const store = new MemoryKeyValueStore()
    const labs = library(store)
    for (let index = 0; index <= MAX_RECENT_LABS; index += 1) await labs.save(`lab${index}`, createEmptyLab(`${index}`, FIXED_NOW))
    const recent = await labs.listRecent()
    expect(recent).toHaveLength(MAX_RECENT_LABS)
    expect(recent[0]?.id).toBe(`lab${MAX_RECENT_LABS}`)
    expect(await store.get('lab.lab0')).toBeUndefined()
  })

  it('ignores damaged storage entries with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const store = new MemoryKeyValueStore()
    await store.set('recentLabs', 'garbage')
    await store.set('autosave', { labId: 'labX' })
    await store.set('lab.labX', '{"schemaVersion":2}')
    const labs = library(store)
    expect(await labs.listRecent()).toEqual([])
    expect(await labs.loadAutosave()).toBeNull()
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('creates readable storage ids', () => {
    expect(newLabId(FIXED_NOW, () => 0.5)).toMatch(/^lab[a-z0-9]+$/)
    expect(newLabId(FIXED_NOW, () => 0.1)).not.toBe(newLabId(FIXED_NOW, () => 0.2))
  })
})

describe('lab key-value stores', () => {
  it('stores labs in IndexedDB', async () => {
    const labs = library(new IdbKeyValueStore('agArizaLabTest', 'labs'))
    await labs.save('labA', sampleLab())
    const reopened = library(new IdbKeyValueStore('agArizaLabTest', 'labs'))
    expect((await reopened.loadAutosave())?.labId).toBe('labA')
  })

  it('falls back to memory after the first storage failure and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const store = new ResilientKeyValueStore(new FailingStore())
    const labs = library(store)
    await labs.save('labA', sampleLab())
    expect(store.usingFallback).toBe(true)
    expect((await labs.loadAutosave())?.labId).toBe('labA')
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('LabAutosaver', () => {
  function manualScheduler(): { scheduler: DelayScheduler; fire: () => void; pending: () => number } {
    let callbacks: (() => void)[] = []
    return {
      scheduler: (callback) => {
        callbacks.push(callback)
        return () => {
          callbacks = callbacks.filter((item) => item !== callback)
        }
      },
      fire: () => {
        const due = callbacks
        callbacks = []
        for (const callback of due) callback()
      },
      pending: () => callbacks.length,
    }
  }

  it('debounces quick edits into one save of the latest document', async () => {
    const labs = library()
    const save = vi.spyOn(labs, 'save')
    const timer = manualScheduler()
    const autosaver = new LabAutosaver(labs, 500, timer.scheduler)
    let doc = sampleLab()
    for (let x = 0; x < 5; x += 1) {
      doc = editor.moveDevices(doc, { pc: { x, y: 0 } })
      autosaver.schedule('labA', doc)
    }
    expect(timer.pending()).toBe(1)
    timer.fire()
    await autosaver.flush()
    expect(save).toHaveBeenCalledTimes(1)
    expect((await labs.loadAutosave())?.doc.layout.devices.pc).toEqual({ x: 4, y: 0 })
  })

  it('flushes immediately and keeps working when saving fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const labs = library()
    vi.spyOn(labs, 'save').mockRejectedValueOnce(new Error('quota'))
    const timer = manualScheduler()
    const autosaver = new LabAutosaver(labs, 500, timer.scheduler)
    autosaver.schedule('labA', sampleLab())
    await autosaver.flush()
    expect(timer.pending()).toBe(0)
    expect(warn).toHaveBeenCalledTimes(1)
    autosaver.schedule('labA', sampleLab())
    await autosaver.flush()
    expect((await labs.loadAutosave())?.labId).toBe('labA')
  })
})
