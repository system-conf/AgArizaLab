// Scenario contract: data that describes one troubleshooting exercise.
// `Scenario` is the LOCALIZED shape the UI consumes; `ScenarioDefinition` is the text-free data.
import type { NetworkState } from './NetworkTypes'

export type ScenarioSetting = 'restoran' | 'ofis' | 'magaza'

export type SolveCondition =
  /** fromDeviceId can ping an internet address (8.8.8.8). */
  | { type: 'internet'; fromDeviceId: string }
  /** fromDeviceId can resolve `name` through its DNS settings. */
  | { type: 'resolves'; fromDeviceId: string; name: string }
  /** fromDeviceId can reach the current IP of toDeviceId. */
  | { type: 'reachable'; fromDeviceId: string; toDeviceId: string }
  /** Every AppLink on deviceId reports ok. */
  | { type: 'appLinksOk'; deviceId: string }

export interface ScenarioExplanation {
  /** What was actually broken, in plain language (localized). */
  whatHappened: string
  /** How this shows up in real life and how it is prevented. */
  realLife: string
  /** A 3–5 sentence answer the player can give in a job interview. */
  interviewAnswer: string
}

export interface Scenario {
  /** camelCase, e.g. 'posGateway' */
  id: string
  order: number
  title: string
  setting: ScenarioSetting
  complaint: {
    /** Who reports the problem, e.g. 'Şube müdürü'. */
    from: string
    message: string
  }
  initialState: NetworkState
  /** All must hold for the scenario to count as solved. */
  solvedWhen: SolveCondition[]
  /** Three levels: direction → location → answer. */
  hints: [string, string, string]
  explanation: ScenarioExplanation
  /** Short topic tags shown on the result screen, e.g. ['Gateway', 'Statik IP']. */
  topics: string[]
}

/**
 * Data-only part of an exercise: topology, ids and solve conditions, with NO user-facing text.
 * Texts live in the `exercises` namespace keyed by `id` (layout in docs/I18N.md); the localizer
 * (`useLocalizedScenarios`) merges both into a `Scenario` for the current language.
 * In `initialState`, `Device.name` and `AppLink.label` are placeholders (use the device id / app
 * link id); the localizer replaces them with `exercises:<id>.devices.<deviceId>` and
 * `exercises:<id>.appLinks.<appLinkId>`. Every exercise has exactly three hints (`hints.0..2`),
 * so no hint count is stored here.
 */
export interface ScenarioDefinition {
  /** camelCase, e.g. 'posGateway'; also the key of the exercise in the `exercises` namespace. */
  id: string
  order: number
  setting: ScenarioSetting
  initialState: NetworkState
  /** All must hold for the scenario to count as solved. */
  solvedWhen: SolveCondition[]
}
