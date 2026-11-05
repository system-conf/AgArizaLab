// Scenario contract: data that describes one troubleshooting exercise.
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
  /** What was actually broken, in plain Turkish. */
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
