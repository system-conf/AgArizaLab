import type { ScenarioSetting } from '../../domain/ScenarioTypes'

/** What the start page needs to know about one scenario. */
export interface ScenarioListItem {
  id: string
  order: number
  title: string
  setting: ScenarioSetting
  completed: boolean
}
