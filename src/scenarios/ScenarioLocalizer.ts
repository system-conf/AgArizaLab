import type { AppLink, Device } from '../domain/NetworkTypes'
import type { Scenario, ScenarioDefinition } from '../domain/ScenarioTypes'
import type { AnyTFunction } from '../i18n/localizedMessage'
import { ExerciseTextReader } from './ExerciseTextReader'

/**
 * v1: merges a text-free ScenarioDefinition with its texts from the `exercises` namespace
 * (layout in docs/I18N.md §5) into the v1 Scenario shape. The app uses ExerciseLocalizer (v2);
 * this class goes with the v1 types. Missing texts fall back to ids (see ExerciseTextReader).
 */
export class ScenarioLocalizer {
  private readonly reader: ExerciseTextReader

  /** `t` is any i18next t function (useTranslation, i18n.t or i18n.getFixedT). */
  constructor(t: AnyTFunction) {
    this.reader = new ExerciseTextReader(t)
  }

  localize(definition: ScenarioDefinition): Scenario {
    const { id } = definition
    const texts = this.reader.texts(id)
    return {
      id,
      order: definition.order,
      title: texts.title,
      setting: definition.setting,
      complaint: texts.complaint,
      initialState: {
        ...definition.initialState,
        devices: definition.initialState.devices.map((device) => this.localizeDevice(id, device)),
      },
      solvedWhen: definition.solvedWhen,
      hints: texts.guide,
      explanation: texts.explanation,
      topics: texts.topics,
    }
  }

  private localizeDevice(scenarioId: string, device: Device): Device {
    const name = this.reader.deviceName(scenarioId, device.id)
    if (device.appLinks === undefined) return { ...device, name }
    const appLinks = device.appLinks.map(
      (appLink): AppLink => ({ ...appLink, label: this.reader.appLinkLabel(scenarioId, appLink.id) }),
    )
    return { ...device, name, appLinks }
  }
}

/** Convenience wrapper: one definition in the language of `t`. */
export function localizeScenario(definition: ScenarioDefinition, t: AnyTFunction): Scenario {
  return new ScenarioLocalizer(t).localize(definition)
}
