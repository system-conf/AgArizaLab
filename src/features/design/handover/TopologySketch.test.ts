import { describe, expect, it } from 'vitest'
import { createLabFromState } from '../../../lab/createLab'
import { officeReferenceState } from '../../../design/testBriefs'
import { TopologySketch } from './TopologySketch'

describe('TopologySketch', () => {
  it('draws nothing for an empty lab', () => {
    expect(TopologySketch.build(createLabFromState({ devices: [], links: [] }, { devices: {} }))).toBeNull()
  })

  it('places devices at their node centres, cables between them and fits the view around everything', () => {
    const state = officeReferenceState()
    const layout = { devices: Object.fromEntries(state.devices.map((device, index) => [device.id, { x: 100 * index, y: 50 }])) }
    const doc = {
      ...createLabFromState(state, layout),
      annotations: [{ id: 'office', type: 'rectangle' as const, at: { x: -200, y: 0 }, width: 100, height: 400, label: 'Office', filled: true, color: 'blue' as const }],
    }
    const sketch = TopologySketch.build(doc)
    if (!sketch) throw new Error('expected a sketch')
    expect(sketch.nodes).toHaveLength(state.devices.length)
    expect(sketch.nodes[0]).toMatchObject({ id: 'isp', x: 32, y: 78 })
    expect(sketch.links).toHaveLength(state.links.length)
    expect(sketch.links[0]).toMatchObject({ id: 'wan', connected: true, wireless: false })
    expect(sketch.zones).toEqual([{ id: 'office', x: -200, y: 0, width: 100, height: 400, label: 'Office', ellipse: false }])
    expect(sketch.viewBox.x).toBe(-248)
    expect(sketch.viewBox.y).toBe(-48)
    expect(sketch.viewBox.height).toBe(496)
  })

  it('puts devices without a position in a row below the others', () => {
    const state = officeReferenceState()
    const sketch = TopologySketch.build(createLabFromState(state, { devices: { isp: { x: 0, y: 0 } } }))
    expect(sketch?.nodes.find((node) => node.id === 'pc1')?.y).toBe(28 + 96)
  })
})
