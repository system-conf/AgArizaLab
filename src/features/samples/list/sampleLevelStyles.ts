import type { SampleLevel } from '../../../samples'

/** Badge colours and filled bars (of three) per sample level. */
export const sampleLevelStyles: Readonly<Record<SampleLevel, { bars: number; badgeClass: string }>> = {
  beginner: { bars: 1, badgeClass: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 ring-emerald-200 dark:ring-emerald-800' },
  intermediate: { bars: 2, badgeClass: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 ring-amber-200 dark:ring-amber-800' },
  advanced: { bars: 3, badgeClass: 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 ring-rose-200 dark:ring-rose-800' },
}
