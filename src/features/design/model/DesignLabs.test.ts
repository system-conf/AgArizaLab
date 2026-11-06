import { describe, expect, it } from 'vitest'
import { officeBrief } from '../../../design/testBriefs'
import type { DesignExercise, DesignLab } from '../../../domain'
import { DesignLabs } from './DesignLabs'

const NOW = new Date('2026-11-06T10:00:00.000Z')

function localized(title: string, suffix: string): DesignExercise {
  const definition = officeBrief()
  const name = (lab: DesignLab): DesignLab => ({
    ...lab,
    state: { ...lab.state, devices: lab.state.devices.map((device) => ({ ...device, name: `${device.id} ${suffix}` })) },
    annotations: [{ id: 'zone', type: 'rectangle', at: { x: 0, y: 0 }, width: 100, height: 80, label: `zone ${suffix}`, filled: true, color: 'blue' }],
  })
  return {
    ...definition,
    lab: name(definition.lab),
    reference: name(definition.reference),
    texts: { title, customer: { from: 'c', message: 'm' }, reference: { explanation: 'e', presentation: 'p', interviewAnswer: 'i' }, topics: [] },
  }
}

describe('DesignLabs', () => {
  const labs = new DesignLabs(() => NOW)
  const tr = localized('Küçük ofis', 'tr')
  const en = localized('Small office', 'en')

  it('opens the starting lab with zones, titled like the brief', () => {
    const doc = labs.open(tr)
    expect(doc.meta).toMatchObject({ title: 'Küçük ofis', createdAt: NOW.toISOString() })
    expect(doc.state).toBe(tr.lab.state)
    expect(doc.annotations).toEqual(tr.lab.annotations)
  })

  it('opens the reference design with the given title', () => {
    const doc = labs.reference(tr, 'Reference')
    expect(doc.meta.title).toBe('Reference')
    expect(doc.state.devices.length).toBeGreaterThan(tr.lab.state.devices.length)
  })

  it('relabels names, zones and the title still in the old language and keeps texts the learner changed', () => {
    const opened = labs.open(tr)
    const devices = opened.state.devices.map((device) => (device.id === 'pc1' ? { ...device, name: 'Reception' } : device))
    const relabelled = labs.relabel({ ...opened, state: { ...opened.state, devices } }, tr, en)
    expect(relabelled.meta.title).toBe('Small office')
    expect(relabelled.state.devices.find((device) => device.id === 'pc2')?.name).toBe('pc2 en')
    expect(relabelled.state.devices.find((device) => device.id === 'pc1')?.name).toBe('Reception')
    expect(relabelled.annotations[0]).toMatchObject({ label: 'zone en' })
    expect(labs.relabel(relabelled, en, en)).toBe(relabelled)
  })

  it('copies a design into a free lab with notes and zones', () => {
    const doc = { ...labs.open(tr), notes: 'VLAN plan' }
    const free = labs.toFreeLab(doc, 'My office')
    expect(free.meta.title).toBe('My office')
    expect(free.notes).toBe('VLAN plan')
    expect(free.annotations).toEqual(doc.annotations)
    expect(free.state).toBe(doc.state)
  })
})
