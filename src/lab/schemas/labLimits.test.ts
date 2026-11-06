import { describe, expect, it } from 'vitest'
import type { LabDocument } from '../../domain'
import { LabSerializer } from '../LabSerializer'
import { expectLabMessage, sampleLab } from '../testLabs'
import { LAB_LIMITS } from './labLimits'
import { labDocumentSchema } from './labDocumentSchema'
import { idSchema } from './portSchemas'

const serializer = new LabSerializer()

function parseErrors(doc: unknown) {
  const result = serializer.parse(JSON.stringify(doc))
  if (result.ok) throw new Error('expected an error')
  return result.errors
}

function withDevice(doc: LabDocument, change: (device: LabDocument['state']['devices'][number]) => LabDocument['state']['devices'][number]): LabDocument {
  return { ...doc, state: { ...doc.state, devices: doc.state.devices.map((device) => (device.id === 'router' ? change(device) : device)) } }
}

describe('lab limits', () => {
  it('refuse prototype keys as ids with their own message', () => {
    for (const id of ['__proto__', 'constructor', 'prototype']) expect(idSchema.safeParse(id).success).toBe(false)
    expect(idSchema.safeParse('router1').success).toBe(true)
    const doc = sampleLab()
    expect(serializer.parse(JSON.stringify(doc)).ok).toBe(true)
    const renamed = { ...doc, annotations: [{ ...doc.annotations[0], id: 'constructor' }] }
    expectLabMessage(parseErrors(renamed)[0], 'lab:schema.reservedId')
    const layoutKey = { ...doc, layout: { devices: { ...doc.layout.devices, prototype: { x: 0, y: 0 } } } }
    const [layoutError] = parseErrors(layoutKey)
    expectLabMessage(layoutError, 'lab:schema.reservedId')
    expect(layoutError?.params?.path).toBe('layout.devices.prototype')
  })

  it('cap list lengths', () => {
    const doc = sampleLab()
    const annotation = doc.annotations[0]
    if (!annotation) throw new Error('sample has an annotation')
    const many = { ...doc, annotations: Array.from({ length: LAB_LIMITS.annotations + 1 }, (_, index) => ({ ...annotation, id: `a${index}` })) }
    const [tooMany] = parseErrors(many)
    expectLabMessage(tooMany, 'lab:schema.tooBig')
    expect(tooMany?.params).toEqual({ path: 'annotations', maximum: String(LAB_LIMITS.annotations) })
    const ports = withDevice(doc, (device) => ({
      ...device,
      ports: Array.from({ length: LAB_LIMITS.portsPerDevice + 1 }, (_, index) => ({ ...device.ports[0], id: `p${index}` })) as typeof device.ports,
    }))
    expect(parseErrors(ports)[0]?.params).toEqual({ path: 'state.devices[router].ports', maximum: String(LAB_LIMITS.portsPerDevice) })
    const layout = Object.fromEntries(Array.from({ length: LAB_LIMITS.devices + 1 }, (_, index) => [`d${index}`, { x: 0, y: 0 }]))
    expect(labDocumentSchema.safeParse({ ...doc, layout: { devices: layout } }).success).toBe(false)
    expect(parseErrors({ ...doc, layout: { devices: layout } })[0]).toMatchObject({ key: 'lab:schema.tooBig', params: { path: 'layout.devices' } })
  })

  it('cap string lengths', () => {
    const doc = sampleLab()
    const title = { ...doc, meta: { ...doc.meta, title: 'x'.repeat(LAB_LIMITS.nameLength + 1) } }
    expect(parseErrors(title)[0]?.params).toEqual({ path: 'meta.title', maximum: String(LAB_LIMITS.nameLength) })
    const notes = { ...doc, notes: 'x'.repeat(LAB_LIMITS.notesLength + 1) }
    expect(parseErrors(notes)[0]?.params).toEqual({ path: 'notes', maximum: String(LAB_LIMITS.notesLength) })
    const name = withDevice(doc, (device) => ({ ...device, name: 'x'.repeat(LAB_LIMITS.nameLength + 1) }))
    expect(parseErrors(name)[0]?.params?.path).toBe('state.devices[router].name')
    const id = withDevice(doc, (device) => ({ ...device, modelId: 'x'.repeat(LAB_LIMITS.idLength + 1) }))
    expect(parseErrors(id)[0]?.params?.maximum).toBe(String(LAB_LIMITS.idLength))
    expect(serializer.parse(JSON.stringify({ ...doc, notes: 'x'.repeat(LAB_LIMITS.notesLength) })).ok).toBe(true)
  })
})
