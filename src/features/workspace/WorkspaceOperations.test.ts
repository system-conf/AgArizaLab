import { describe, expect, it } from 'vitest'
import type { LabDocument } from '../../domain/v2'
import { findDeviceModel, PortFactory } from '../../catalog'
import { createEmptyLab, labEditor } from '../../lab'
import { EMPTY_SELECTION } from './canvas/canvasTypes'
import { annotationNodeId } from './canvas/flowElements'
import { SelectionModel } from './canvas/SelectionModel'
import { CableLinkBuilder } from './cable/CableLinkBuilder'
import { WorkspaceOperations } from './WorkspaceOperations'

const operations = new WorkspaceOperations(labEditor)
const builder = new CableLinkBuilder()

function device(modelId: string, id: string) {
  const model = findDeviceModel(modelId)
  if (!model) throw new Error(`missing model ${modelId}`)
  return PortFactory.createDevice(model, id, id)
}

/** pc1 —(eth0 ↔ Fa0/1)— switch1, plus a note. */
function smallLab(): LabDocument {
  let doc = createEmptyLab('test', new Date('2026-11-06T00:00:00Z'))
  doc = labEditor.addDevice(doc, device('pc', 'pc1'), { x: 0, y: 0 })
  doc = labEditor.addDevice(doc, device('switch8', 'switch1'), { x: 200, y: 0 })
  const request = builder.request('copperStraight', { deviceId: 'pc1', portId: 'eth0' }, { deviceId: 'switch1', portId: 'Fa0/1' })
  const result = labEditor.connect(doc, builder.link(request, labEditor.nextLinkId(doc)))
  if (!result.ok) throw new Error(`connect refused: ${result.refusal}`)
  return operations.addNote(result.doc, 'annotation1', { x: 10, y: 300 }, 'Kitchen')
}

describe('WorkspaceOperations', () => {
  it('deletes selected devices with their cables, and selected notes', () => {
    const doc = smallLab()
    const next = operations.deleteSelection(doc, { deviceIds: ['switch1'], linkIds: [], annotationIds: ['annotation1'] })
    expect(next.state.devices.map((candidate) => candidate.id)).toEqual(['pc1'])
    expect(next.state.links).toEqual([])
    expect(next.annotations).toEqual([])
    expect(next.layout.devices.switch1).toBeUndefined()
  })

  it('deletes a selected cable only', () => {
    const doc = smallLab()
    const linkId = doc.state.links[0]?.id ?? ''
    const next = operations.deleteSelection(doc, { ...EMPTY_SELECTION, linkIds: [linkId] })
    expect(next.state.links).toEqual([])
    expect(next.state.devices).toHaveLength(2)
  })

  it('moves devices and annotations in one document change', () => {
    const doc = smallLab()
    const next = operations.move(doc, [
      { nodeId: 'pc1', to: { x: 24, y: 48 } },
      { nodeId: annotationNodeId('annotation1'), to: { x: 96, y: 96 } },
    ])
    expect(next.layout.devices.pc1).toEqual({ x: 24, y: 48 })
    expect(next.annotations[0]).toMatchObject({ type: 'text', at: { x: 96, y: 96 } })
  })

  it('saves note text, ignores unchanged text and removes blank notes', () => {
    const doc = smallLab()
    expect(operations.setNoteText(doc, 'annotation1', 'Kitchen')).toBe(doc)
    expect(operations.setNoteText(doc, 'annotation1', 'Bar').annotations[0]).toMatchObject({ text: 'Bar' })
    expect(operations.setNoteText(doc, 'annotation1', '   ').annotations).toEqual([])
  })
})

describe('SelectionModel', () => {
  it('adds and removes nodes by kind', () => {
    let selection = SelectionModel.node(EMPTY_SELECTION, 'pc1', true)
    selection = SelectionModel.node(selection, annotationNodeId('annotation1'), true)
    selection = SelectionModel.link(selection, 'link1', true)
    expect(selection).toEqual({ deviceIds: ['pc1'], linkIds: ['link1'], annotationIds: ['annotation1'] })
    expect(SelectionModel.count(selection)).toBe(3)
    expect(SelectionModel.node(selection, 'pc1', false).deviceIds).toEqual([])
    expect(SelectionModel.node(selection, 'pc1', true)).toBe(selection)
  })

  it('selects everything and prunes ids that disappeared', () => {
    const doc = smallLab()
    const all = SelectionModel.all(doc)
    expect(SelectionModel.count(all)).toBe(4)
    const after = operations.deleteSelection(doc, SelectionModel.only('deviceIds', 'switch1'))
    expect(SelectionModel.prune(all, after)).toEqual({ deviceIds: ['pc1'], linkIds: [], annotationIds: ['annotation1'] })
    expect(SelectionModel.prune(all, doc)).toBe(all)
  })
})
