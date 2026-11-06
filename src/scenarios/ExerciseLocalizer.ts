import type { Device, Exercise, ExerciseDefinition } from '../domain'
import type { AnyTFunction } from '../i18n/localizedMessage'
import { ExerciseTextReader } from './ExerciseTextReader'

/**
 * Merges a text-free ExerciseDefinition with its texts from the `exercises` namespace into the
 * localized `Exercise` the UI consumes: device names and AppLink labels (placeholders = ids in the
 * data) are filled in, the texts are attached.
 */
export class ExerciseLocalizer {
  private readonly reader: ExerciseTextReader

  /** `t` is any i18next t function (useTranslation, i18n.t or i18n.getFixedT). */
  constructor(t: AnyTFunction) {
    this.reader = new ExerciseTextReader(t)
  }

  localize(definition: ExerciseDefinition): Exercise {
    const { state } = definition.lab
    return {
      ...definition,
      lab: { ...definition.lab, state: { ...state, devices: state.devices.map((device) => this.localizeDevice(definition.id, device)) } },
      texts: this.reader.texts(definition.id),
    }
  }

  private localizeDevice(exerciseId: string, device: Device): Device {
    const name = this.reader.deviceName(exerciseId, device.id)
    if (device.host === undefined) return { ...device, name }
    const appLinks = device.host.appLinks.map((appLink) => ({ ...appLink, label: this.reader.appLinkLabel(exerciseId, appLink.id) }))
    return { ...device, name, host: { ...device.host, appLinks } }
  }
}
