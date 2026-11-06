import type { Annotation, DesignBriefTexts, DesignExercise, DesignExerciseDefinition, DesignLab, Device } from '../../../domain'
import { translateList, translateMessage, type AnyTFunction } from '../../../i18n/localizedMessage'

/** Namespace of the brief texts (owned by D3, docs/DESIGN_EXERCISES.md coordinator decision 2). */
export const BRIEF_NAMESPACE = 'designBriefs'

/**
 * Merges a text-free DesignExerciseDefinition with its texts (`designBriefs:<id>.*`) into the
 * localized `DesignExercise` the UI consumes: device names (starting lab and reference), group names
 * and zone labels are filled in, the texts are attached. A missing text never crashes: it is logged
 * and replaced by the id (topics by an empty list).
 */
export class DesignBriefLocalizer {
  private readonly t: AnyTFunction

  /** `t` is any i18next t function (useTranslation, i18n.t or i18n.getFixedT). */
  constructor(t: AnyTFunction) {
    this.t = t
  }

  localize(definition: DesignExerciseDefinition): DesignExercise {
    const id = definition.id
    return {
      ...definition,
      lab: this.localizeLab(id, definition.lab),
      reference: this.localizeLab(id, definition.reference),
      groups: definition.groups.map((group) => ({ ...group, name: this.text(id, `groups.${group.id}`, group.id) })),
      texts: this.texts(id),
    }
  }

  texts(briefId: string): DesignBriefTexts {
    const text = (path: string) => this.text(briefId, path, briefId)
    return {
      title: text('title'),
      customer: { from: text('customer.from'), message: text('customer.message') },
      reference: {
        explanation: text('reference.explanation'),
        presentation: text('reference.presentation'),
        interviewAnswer: text('reference.interviewAnswer'),
      },
      topics: translateList(this.t, `${BRIEF_NAMESPACE}:${briefId}.topics`),
    }
  }

  private localizeLab(briefId: string, lab: DesignLab): DesignLab {
    return {
      ...lab,
      state: { ...lab.state, devices: lab.state.devices.map((device) => this.localizeDevice(briefId, device)) },
      annotations: lab.annotations.map((annotation) => this.localizeZone(briefId, annotation)),
    }
  }

  private localizeDevice(briefId: string, device: Device): Device {
    return { ...device, name: this.text(briefId, `devices.${device.id}`, device.name) }
  }

  /** Zone labels: text notes and shape labels; lines carry no text. */
  private localizeZone(briefId: string, annotation: Annotation): Annotation {
    switch (annotation.type) {
      case 'text':
        return { ...annotation, text: this.text(briefId, `zones.${annotation.id}`, annotation.text) }
      case 'rectangle':
      case 'ellipse':
        return annotation.label === undefined ? annotation : { ...annotation, label: this.text(briefId, `zones.${annotation.id}`, annotation.label) }
      case 'line':
        return annotation
    }
  }

  /** i18next returns the key (with or without namespace) for a missing text; that counts as missing. */
  private text(briefId: string, path: string, fallback: string): string {
    const key = `${BRIEF_NAMESPACE}:${briefId}.${path}`
    const result = translateMessage(this.t, { key })
    const keyWithoutNamespace = key.slice(key.indexOf(':') + 1)
    if (result.trim() !== '' && result !== key && result !== keyWithoutNamespace) return result
    console.warn(`Missing design brief text '${key}', showing '${fallback}' instead`)
    return fallback
  }
}
