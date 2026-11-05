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
  easy: { bars: 1, badgeClass: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  medium: { bars: 2, badgeClass: 'bg-amber-50 text-amber-800 ring-amber-200' },
  hard: { bars: 3, badgeClass: 'bg-rose-50 text-rose-800 ring-rose-200' },
}

/** Difficulty of an exercise; unknown (new) exercises count as 'medium' until they are added here. */
export function difficultyOf(scenarioId: string): DifficultyLevel {
  return difficultyById[scenarioId] ?? 'medium'
}
