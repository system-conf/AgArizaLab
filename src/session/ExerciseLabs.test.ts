import { describe, expect, it } from 'vitest'
import type { Exercise, ExerciseTexts } from '../domain'
import { labEditor } from '../lab/LabEditor'
import { exerciseDefinitions } from '../scenarios/exerciseDefinitions'
import { ExerciseLabs } from './ExerciseLabs'

const OPENED = new Date('2026-11-06T10:00:00.000Z')
const COPIED = new Date('2026-11-06T11:00:00.000Z')

function texts(title: string): ExerciseTexts {
  return {
    title,
    complaint: { from: 'from', message: 'message' },
    guide: ['a', 'b', 'c'],
    explanation: { whatHappened: 'w', realLife: 'r', interviewAnswer: 'i' },
    topics: [],
  }
}

/** printerDhcp with names and AppLink labels in a fake language `prefix`. */
function exerciseIn(prefix: string): Exercise {
  const definition = exerciseDefinitions.find((candidate) => candidate.id === 'printerDhcp')
  if (!definition) throw new Error('printerDhcp missing')
  const devices = definition.lab.state.devices.map((device) => ({
    ...device,
    name: `${prefix} ${device.id}`,
    ...(device.host
      ? { host: { ...device.host, appLinks: device.host.appLinks.map((appLink) => ({ ...appLink, label: `${prefix} ${appLink.id}` })) } }
      : {}),
  }))
  return { ...definition, lab: { ...definition.lab, state: { ...definition.lab.state, devices } }, texts: texts(`${prefix} title`) }
}

describe('ExerciseLabs', () => {
  const labs = new ExerciseLabs(() => OPENED)

  it('opens an exercise as a lab with its title, network and canvas', () => {
    const exercise = exerciseIn('tr')
    const doc = labs.open(exercise)
    expect(doc.meta).toMatchObject({ title: 'tr title', createdAt: OPENED.toISOString() })
    expect(doc.state).toBe(exercise.lab.state)
    expect(doc.layout).toBe(exercise.lab.layout)
  })

  it('relabels names, AppLink labels and title but keeps the learner’s changes', () => {
    const tr = exerciseIn('tr')
    const en = exerciseIn('en')
    const opened = labs.open(tr)
    const deviceOf = (doc: typeof opened, id: string) => {
      const found = doc.state.devices.find((device) => device.id === id)
      if (!found) throw new Error(`${id} missing`)
      return found
    }
    let edited = labEditor.updateDevice(opened, { ...deviceOf(opened, 'muhasebe'), powered: false })
    edited = labEditor.renameDevice(edited, 'satis', 'Benim PC')
    const relabelled = labs.relabel(edited, tr, en)
    expect(relabelled.meta.title).toBe('en title')
    const pc = deviceOf(relabelled, 'muhasebe')
    expect(pc.name).toBe('en muhasebe')
    expect(pc.powered).toBe(false)
    expect(pc.host?.appLinks.map((appLink) => appLink.label)).toEqual(['en yazici'])
    expect(deviceOf(relabelled, 'satis').name).toBe('Benim PC')
    expect(labs.relabel(relabelled, en, en)).toBe(relabelled)
    expect(labs.relabel(relabelled, en, tr).meta.title).toBe('tr title')
  })

  it('copies a solved exercise into a free lab ("Open in lab")', () => {
    const solved = labEditor.setNotes(labs.open(exerciseIn('en')), 'printer moved to .153')
    const free = new ExerciseLabs(() => COPIED).toFreeLab(solved, 'My printer lab')
    expect(free.meta).toEqual({ title: 'My printer lab', createdAt: COPIED.toISOString(), updatedAt: COPIED.toISOString() })
    expect(free.state).toEqual(solved.state)
    expect(free.layout).toEqual(solved.layout)
    expect(free.notes).toBe('printer moved to .153')
    expect(free.annotations).toEqual(solved.annotations)
    expect(free.schemaVersion).toBe(2)
  })
})
