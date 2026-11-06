import type { ExerciseSetting } from '../../domain/v2'

/** What the exercise list needs to know about one exercise. */
export interface ScenarioListItem {
  id: string
  order: number
  title: string
  setting: ExerciseSetting
  /** Short topic tags, e.g. ['VLAN', 'Switch port']. */
  topics: string[]
  completed: boolean
}
