export type DifficultyLevel = 'kolay' | 'orta' | 'zor'

interface DifficultyInfo {
  label: string
  /** 1..3 filled bars in the difficulty meter. */
  bars: 1 | 2 | 3
  /** Tailwind classes for the badge. */
  badgeClass: string
}

/** UI-only difficulty of each scenario, keyed by scenario id (scenario data stays unchanged). */
const difficultyById: Record<string, DifficultyLevel> = {
  posGateway: 'kolay',
  wrongDns: 'kolay',
  printerDhcp: 'orta',
  cameraSubnet: 'orta',
  kitchenVlan: 'zor',
}

export const difficultyInfo: Record<DifficultyLevel, DifficultyInfo> = {
  kolay: { label: 'Kolay', bars: 1, badgeClass: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  orta: { label: 'Orta', bars: 2, badgeClass: 'bg-amber-50 text-amber-800 ring-amber-200' },
  zor: { label: 'Zor', bars: 3, badgeClass: 'bg-rose-50 text-rose-800 ring-rose-200' },
}

/** Difficulty of a scenario; unknown (new) scenarios count as 'orta' until they are added here. */
export function difficultyOf(scenarioId: string): DifficultyLevel {
  return difficultyById[scenarioId] ?? 'orta'
}
