// Design brief ↔ lab document: opening a brief (or its reference design) as a lab, relabelling it in
// another language and copying a design into a free lab ("Open in the lab").
import type { Annotation, DesignExercise, DesignLab, LabDocument } from '../../../domain'
import { createLabFromState } from '../../../lab/createLab'

type Labels = ReadonlyMap<string, string>

/** Text of a zone annotation (text notes and shape labels); undefined for lines. */
function zoneText(annotation: Annotation): string | undefined {
  switch (annotation.type) {
    case 'text':
      return annotation.text
    case 'rectangle':
    case 'ellipse':
      return annotation.label
    case 'line':
      return undefined
  }
}

function withZoneText(annotation: Annotation, text: string): Annotation {
  switch (annotation.type) {
    case 'text':
      return { ...annotation, text }
    case 'rectangle':
    case 'ellipse':
      return { ...annotation, label: text }
    case 'line':
      return annotation
  }
}

/** Device names and zone texts of a brief lab in one language. */
function labelsOf(lab: DesignLab): { devices: Labels; zones: Labels } {
  return {
    devices: new Map(lab.state.devices.map((device) => [device.id, device.name])),
    zones: new Map(lab.annotations.flatMap((annotation) => {
      const text = zoneText(annotation)
      return text === undefined ? [] : [[annotation.id, text] as const]
    })),
  }
}

/** `next` text when `current` still is the old text of the same item; the learner's own text otherwise. */
function swap(current: string, id: string, from: Labels, to: Labels): string {
  const before = from.get(id)
  const after = to.get(id)
  return before !== undefined && after !== undefined && current === before ? after : current
}

export class DesignLabs {
  private readonly clock: () => Date

  constructor(clock: () => Date = () => new Date()) {
    this.clock = clock
  }

  /** The brief's starting lab (customer devices, zones) titled like the brief. */
  open(brief: DesignExercise): LabDocument {
    return this.labOf(brief.lab, brief.texts.title)
  }

  /** The brief's reference design as a lab with the given title. */
  reference(brief: DesignExercise, title: string): LabDocument {
    return this.labOf(brief.reference, title)
  }

  /**
   * The lab opened from `from` relabelled to `to` (the same brief in another language): title, device
   * names and zone texts that still show the old text get the new one; the learner's own texts and
   * every setting stay. Returns `doc` itself when nothing changes.
   */
  relabel(doc: LabDocument, from: DesignExercise, to: DesignExercise): LabDocument {
    const old = labelsOf(from.lab)
    const next = labelsOf(to.lab)
    const devices = doc.state.devices.map((device) => {
      const name = swap(device.name, device.id, old.devices, next.devices)
      return name === device.name ? device : { ...device, name }
    })
    const annotations = doc.annotations.map((annotation) => {
      const text = zoneText(annotation)
      if (text === undefined) return annotation
      const swapped = swap(text, annotation.id, old.zones, next.zones)
      return swapped === text ? annotation : withZoneText(annotation, swapped)
    })
    const title = doc.meta.title === from.texts.title ? to.texts.title : doc.meta.title
    const changed =
      title !== doc.meta.title ||
      devices.some((device, index) => device !== doc.state.devices[index]) ||
      annotations.some((annotation, index) => annotation !== doc.annotations[index])
    if (!changed) return doc
    return { ...doc, meta: { ...doc.meta, title }, state: { ...doc.state, devices }, annotations }
  }

  /** A new free lab from a design: same network, canvas, notes and zones; new title and timestamps. */
  toFreeLab(doc: LabDocument, title: string): LabDocument {
    const lab = createLabFromState(doc.state, doc.layout, { title, now: this.clock() })
    return { ...lab, notes: doc.notes, annotations: doc.annotations }
  }

  private labOf(lab: DesignLab, title: string): LabDocument {
    const doc = createLabFromState(lab.state, lab.layout, { title, now: this.clock() })
    return { ...doc, annotations: lab.annotations }
  }
}

export const designLabs = new DesignLabs()
