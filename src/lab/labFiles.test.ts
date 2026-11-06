import { describe, expect, it, vi } from 'vitest'
import { createEmptyLab } from './createLab'
import { importLabFile, labFileName } from './labFiles'
import { LabSerializer } from './LabSerializer'
import { MAX_LAB_TEXT_SIZE } from './schemas/labLimits'
import { expectLabMessage, FIXED_NOW, sampleLab } from './testLabs'

describe('lab files', () => {
  it('names the file after the title, keeping letters of any script', () => {
    expect(labFileName(createEmptyLab('Ofis ağı / 2. kat', FIXED_NOW))).toBe('Ofis_ağı_2_kat.agl.json')
    expect(labFileName(createEmptyLab('', FIXED_NOW))).toBe('lab.agl.json')
    expect(labFileName(createEmptyLab('***', FIXED_NOW))).toBe('lab.agl.json')
    expect(labFileName(createEmptyLab('x'.repeat(200), FIXED_NOW))).toBe(`${'x'.repeat(60)}.agl.json`)
  })

  it('imports an exported file', async () => {
    const doc = sampleLab()
    const file = new Blob([new LabSerializer().serialize(doc)], { type: 'application/json' })
    expect(await importLabFile(file)).toEqual({ ok: true, doc, origin: null })
  })

  it('reports files that cannot be read or parsed', async () => {
    const unreadable = { text: () => Promise.reject(new Error('gone')) } as unknown as Blob
    const result = await importLabFile(unreadable)
    if (result.ok) throw new Error('expected an error')
    expectLabMessage(result.errors[0], 'lab:import.readFailed')
    const garbage = await importLabFile(new Blob(['not json']))
    if (garbage.ok) throw new Error('expected an error')
    expectLabMessage(garbage.errors[0], 'lab:import.notJson')
  })
})

describe('lab file size limit', () => {
  it('refuses a file above the limit without reading it', async () => {
    const text = vi.fn(() => Promise.resolve('{}'))
    const huge = { size: MAX_LAB_TEXT_SIZE + 1, text } as unknown as Blob
    const result = await importLabFile(huge)
    if (result.ok) throw new Error('expected an error')
    expectLabMessage(result.errors[0], 'lab:import.fileTooLarge')
    expect(result.errors[0]?.params).toEqual({ size: 5.1, limit: 5 })
    expect(text).not.toHaveBeenCalled()
  })
})
