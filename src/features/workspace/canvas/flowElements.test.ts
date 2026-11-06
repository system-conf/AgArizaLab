import { describe, expect, it } from 'vitest'
import type { WorkspaceNode } from './canvasTypes'
import { reuseUnchanged } from './flowElements'
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
