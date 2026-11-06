import type { DesignExercise, DesignSetting } from '../../../domain'
import type { DifficultyLevel } from '../../scenario/scenarioDifficulty'
import { designDifficultyOf } from '../model/designDifficulty'
import type { DesignProgressMap } from '../model/DesignProgressStore'

/** Where the learner stands with a brief. */
export type DesignListState = 'new' | 'submitted' | 'solved'

/** What the brief list needs to know about one brief. */
export interface DesignListItem {
  id: string
  order: number
  title: string
  setting: DesignSetting
  difficulty: DifficultyLevel
  /** Price units; undefined = no budget limit. */
  budget?: number
  topics: string[]
  state: DesignListState
}

/** List items of the localized briefs with their saved progress. */
export function designListItems(briefs: readonly DesignExercise[], progress: DesignProgressMap): DesignListItem[] {
  return briefs.map((brief) => {
    const saved = Object.hasOwn(progress, brief.id) ? progress[brief.id] : undefined
    const state: DesignListState = saved === undefined ? 'new' : saved.solved ? 'solved' : 'submitted'
    return {
      id: brief.id,
      order: brief.order,
      title: brief.texts.title,
      setting: brief.setting,
      difficulty: designDifficultyOf(brief),
      ...(brief.budget === undefined ? {} : { budget: brief.budget }),
      topics: brief.texts.topics,
      state,
    }
  })
}
