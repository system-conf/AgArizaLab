/** Difficulty level; the label is translated as `landing:difficulty.<level>`. */
export type DifficultyLevel = 'easy' | 'medium' | 'hard'

interface DifficultyStyle {
  /** 1..3 filled bars in the difficulty meter. */
  bars: 1 | 2 | 3
  /** Tailwind classes for the badge. */
  badgeClass: string
}

/** UI-only difficulty of each exercise, keyed by scenario id (scenario data stays unchanged). */
const difficultyById: Record<string, DifficultyLevel> = {
  posGateway: 'easy',
  wrongDns: 'easy',
  printerDhcp: 'medium',
  cameraSubnet: 'medium',
  kitchenVlan: 'hard',
}

export const difficultyStyles: Record<DifficultyLevel, DifficultyStyle> = {
  easy: { bars: 1, badgeClass: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 ring-emerald-200 dark:ring-emerald-800' },
  medium: { bars: 2, badgeClass: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 ring-amber-200 dark:ring-amber-800' },
  hard: { bars: 3, badgeClass: 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 ring-rose-200 dark:ring-rose-800' },
}

/** Difficulty of an exercise; unknown (new) exercises count as 'medium' until they are added here. */
export function difficultyOf(scenarioId: string): DifficultyLevel {
  return difficultyById[scenarioId] ?? 'medium'
}
