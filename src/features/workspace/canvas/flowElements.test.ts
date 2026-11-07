import { describe, expect, it } from 'vitest'
import type { LabDocument, Link, LinkLight } from '../../../domain'
import { largeLabDocument } from '../../../workers/largeLabDocument'
import { EMPTY_SELECTION, type WorkspaceNode, type WorkspaceSelection } from './canvasTypes'
import { buildEdges, buildNodes, reuseUnchanged, withDragPositions, type FlowLabels } from './flowElements'
import { makeDevice } from '../../../domain/testDevices'

const DEVICES = new Map([makeDevice('a', 'pc', []), makeDevice('b', 'pc', [])].map((device) => [device.id, device]))

function deviceNode(id: string, x: number): WorkspaceNode {
  return {
    id,
    type: 'device',
    position: { x, y: 0 },
    data: { device: DEVICES.get(id) ?? makeDevice(id, 'pc', []), modelName: 'PC', cableHighlight: 'none' },
    selected: false,
    draggable: true,
    measured: { width: 48, height: 48 },
  }
}

const LABELS: FlowLabels = {
  device: (device) => device.name,
  modelName: (device) => device.modelId,
  annotation: () => '',
  link: (link) => link.id,
}
const lightOf = (): LinkLight => 'up'

function nodesOf(doc: LabDocument, selection: WorkspaceSelection): WorkspaceNode[] {
  return buildNodes({ doc, selection, measured: {}, labels: LABELS, cableHighlight: () => 'none', devicesDraggable: true })
}

/** Elements that got a new object: the ones React Flow and the memoised components re-render. */
function changed<Element>(previous: readonly Element[], next: readonly Element[]): number {
  return next.filter((element, index) => element !== previous[index]).length
}

describe('reuseUnchanged', () => {
  it('keeps the objects of unchanged nodes, so a drag frame re-renders only the moved node', () => {
    const previous = [deviceNode('a', 0), deviceNode('b', 100)]
    const next = reuseUnchanged(previous, [deviceNode('a', 0), deviceNode('b', 130)])
    expect(next[0]).toBe(previous[0])
    expect(next[1]).not.toBe(previous[1])
    expect(next[1]?.position).toEqual({ x: 130, y: 0 })
  })

  it('takes a new object when data or selection changed', () => {
    const previous = [deviceNode('a', 0)]
    const reselected = reuseUnchanged(previous, [{ ...deviceNode('a', 0), selected: true }])
    expect(reselected[0]).not.toBe(previous[0])
    const relabelled = reuseUnchanged(previous, [{ ...deviceNode('a', 0), ariaLabel: 'A (off)' }])
    expect(relabelled[0]).not.toBe(previous[0])
  })
})

describe('canvas elements of a 300-device lab (render counts)', () => {
  const doc = largeLabDocument(300)
  const firstHost = doc.state.devices.find((device) => device.id === 'h1x0')
  const hostLink = doc.state.links.find((link) => link.a.deviceId === 'h1x0')

  it('is a lab of about 300 devices with a position for every device', () => {
    expect(doc.state.devices).toHaveLength(292)
    expect(doc.state.devices.every((device) => doc.layout.devices[device.id] !== undefined)).toBe(true)
    expect(firstHost).toBeDefined()
    expect(hostLink).toBeDefined()
  })

  it('a selection change re-renders only the nodes and cables whose selection changed', () => {
    const nodes = nodesOf(doc, EMPTY_SELECTION)
    const edges = buildEdges(doc, EMPTY_SELECTION, lightOf, LABELS)
    const selection: WorkspaceSelection = { ...EMPTY_SELECTION, deviceIds: ['h1x0'], linkIds: [hostLink?.id ?? ''] }
    const nextNodes = reuseUnchanged(nodes, nodesOf(doc, selection))
    const nextEdges = reuseUnchanged(edges, buildEdges(doc, selection, lightOf, LABELS))
    expect(changed(nodes, nextNodes)).toBe(1)
    expect(changed(edges, nextEdges)).toBe(1)
    // Rebuilding with nothing changed keeps every object.
    expect(changed(nextEdges, reuseUnchanged(nextEdges, buildEdges(doc, selection, lightOf, LABELS)))).toBe(0)
  })

  it('a cable whose light changed gets a new object, the others keep theirs', () => {
    const edges = buildEdges(doc, EMPTY_SELECTION, lightOf, LABELS)
    const down = (link: Link): LinkLight => (link.id === hostLink?.id ? 'down' : 'up')
    expect(changed(edges, reuseUnchanged(edges, buildEdges(doc, EMPTY_SELECTION, down, LABELS)))).toBe(1)
  })

  it('a drag frame replaces only the dragged node and keeps the list when nothing is dragged', () => {
    const nodes = nodesOf(doc, EMPTY_SELECTION)
    expect(withDragPositions(nodes, {})).toBe(nodes)
    const dragged = withDragPositions(nodes, { h1x0: { x: 5, y: 7 } })
    expect(changed(nodes, dragged)).toBe(1)
    expect(dragged.find((node) => node.id === 'h1x0')?.position).toEqual({ x: 5, y: 7 })
    const atRest = doc.layout.devices.h1x0 ?? { x: 0, y: 0 }
    expect(changed(nodes, withDragPositions(nodes, { h1x0: { ...atRest } }))).toBe(0)
  })
})
