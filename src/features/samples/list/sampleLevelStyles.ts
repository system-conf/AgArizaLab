import type { SampleLevel } from '../../../samples'

/** Badge colours and filled bars (of three) per sample level. */
export const sampleLevelStyles: Readonly<Record<SampleLevel, { bars: number; badgeClass: string }>> = {
  beginner: { bars: 1, badgeClass: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  intermediate: { bars: 2, badgeClass: 'bg-amber-50 text-amber-800 ring-amber-200' },
  advanced: { bars: 3, badgeClass: 'bg-rose-50 text-rose-800 ring-rose-200' },
}
