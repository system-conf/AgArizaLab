// Exercise ↔ lab document: opening an exercise as a lab, relabelling it in another language and
// copying a solved exercise network into a free lab ("Open in lab").
import type { DeviceV2, Exercise, LabDocument } from '../domain/v2'
import { createLabFromExercise, createLabFromState } from '../lab/createLab'

type Labels = ReadonlyMap<string, string>

/** Display texts of an exercise lab in one language: device names and AppLink labels by id. */
function labelsOf(exercise: Exercise): { names: Labels; appLinks: Labels } {
  const devices = exercise.lab.state.devices
  return {
    names: new Map(devices.map((device) => [device.id, device.name])),
    appLinks: new Map(devices.flatMap((device) => (device.host?.appLinks ?? []).map((appLink) => [`${device.id}/${appLink.id}`, appLink.label]))),
  }
}

/** `next` text when `current` still is the old text of the same item; the learner's own text otherwise. */
function swap(current: string, key: string, from: Labels, to: Labels): string {
  const before = from.get(key)
  const after = to.get(key)
  return before !== undefined && after !== undefined && current === before ? after : current
}

export class ExerciseLabs {
  private readonly clock: () => Date

  constructor(clock: () => Date = () => new Date()) {
    this.clock = clock
  }

  /** The exercise's network and canvas as a lab titled like the exercise (localized names). */
  open(exercise: Exercise): LabDocument {
    return createLabFromExercise(exercise, { title: exercise.texts.title, now: this.clock() })
  }

  /**
   * The lab opened from `from` relabelled to `to` (the same exercise in another language): title,
   * device names and AppLink labels that still show the old text get the new one; texts the learner
   * changed and every setting stay. Returns `doc` itself when nothing changes.
   */
  relabel(doc: LabDocument, from: Exercise, to: Exercise): LabDocument {
    const old = labelsOf(from)
    const next = labelsOf(to)
    const devices = doc.state.devices.map((device) => this.relabelDevice(device, old, next))
    const title = doc.meta.title === from.texts.title ? to.texts.title : doc.meta.title
    const changed = title !== doc.meta.title || devices.some((device, index) => device !== doc.state.devices[index])
    if (!changed) return doc
    return { ...doc, meta: { ...doc.meta, title }, state: { ...doc.state, devices } }
  }

  /**
   * A new free lab from an exercise lab: same network, canvas, notes and annotations, new title
   * and timestamps. Nothing of the exercise (locks, conditions) comes along.
   */
  toFreeLab(doc: LabDocument, title: string): LabDocument {
    const lab = createLabFromState(doc.state, doc.layout, { title, now: this.clock() })
    return { ...lab, notes: doc.notes, annotations: doc.annotations }
  }

  private relabelDevice(device: DeviceV2, from: ReturnType<typeof labelsOf>, to: ReturnType<typeof labelsOf>): DeviceV2 {
    const name = swap(device.name, device.id, from.names, to.names)
    const host = device.host
    const appLinks = host?.appLinks.map((appLink) => {
      const label = swap(appLink.label, `${device.id}/${appLink.id}`, from.appLinks, to.appLinks)
      return label === appLink.label ? appLink : { ...appLink, label }
    })
    const linksChanged = host !== undefined && appLinks !== undefined && appLinks.some((appLink, index) => appLink !== host.appLinks[index])
    if (name === device.name && !linksChanged) return device
    const named = { ...device, name }
    return host !== undefined && appLinks !== undefined && linksChanged ? { ...named, host: { ...host, appLinks } } : named
  }
}

export const exerciseLabs = new ExerciseLabs()
