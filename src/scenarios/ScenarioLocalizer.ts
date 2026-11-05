import type { AppLink, Device } from '../domain/NetworkTypes'
import type { Scenario, ScenarioDefinition } from '../domain/ScenarioTypes'
import { translateList, translateMessage, type AnyTFunction } from '../i18n/localizedMessage'

/**
 * Merges a text-free ScenarioDefinition with its texts from the `exercises` namespace
 * (layout in docs/I18N.md §5) into the Scenario shape the UI consumes.
 * A missing text never crashes: it is reported with console.warn and replaced by the id
 * (scenario id, device id or app link id); missing topics become an empty list.
 */
export class ScenarioLocalizer {
  private readonly t: AnyTFunction

  /** `t` is any i18next t function (useTranslation, i18n.t or i18n.getFixedT). */
  constructor(t: AnyTFunction) {
    this.t = t
  }

  localize(definition: ScenarioDefinition): Scenario {
    const { id } = definition
    const text = (path: string): string => this.text(`exercises:${id}.${path}`, id)
    return {
      id,
      order: definition.order,
      title: text('title'),
      setting: definition.setting,
      complaint: { from: text('complaint.from'), message: text('complaint.message') },
      initialState: {
        ...definition.initialState,
        devices: definition.initialState.devices.map((device) => this.localizeDevice(id, device)),
      },
      solvedWhen: definition.solvedWhen,
      hints: [text('hints.0'), text('hints.1'), text('hints.2')],
      explanation: {
        whatHappened: text('explanation.whatHappened'),
        realLife: text('explanation.realLife'),
        interviewAnswer: text('explanation.interviewAnswer'),
      },
      topics: translateList(this.t, `exercises:${id}.topics`),
    }
  }

  private localizeDevice(scenarioId: string, device: Device): Device {
    const name = this.text(`exercises:${scenarioId}.devices.${device.id}`, device.id)
    if (device.appLinks === undefined) return { ...device, name }
    const appLinks = device.appLinks.map(
      (appLink): AppLink => ({
        ...appLink,
        label: this.text(`exercises:${scenarioId}.appLinks.${appLink.id}`, appLink.id),
      }),
    )
    return { ...device, name, appLinks }
  }

  /** i18next returns the key (with or without namespace) for a missing text; that counts as missing. */
  private text(key: string, fallback: string): string {
    const result = translateMessage(this.t, { key })
    const keyWithoutNamespace = key.slice(key.indexOf(':') + 1)
    if (result.trim() !== '' && result !== key && result !== keyWithoutNamespace) return result
    console.warn(`Missing exercise text '${key}', showing '${fallback}' instead`)
    return fallback
  }
}

/** Convenience wrapper: one definition in the language of `t`. */
export function localizeScenario(definition: ScenarioDefinition, t: AnyTFunction): Scenario {
  return new ScenarioLocalizer(t).localize(definition)
}
