// Catalogue metadata of docs/SAMPLE_LABS.md: categories in display order, levels, feature availability.
import type { SampleCategoryId, SampleFeature, SampleLevel } from './SampleTypes'

/** When a category's samples ship ("Needs" column of docs/SAMPLE_LABS.md). */
export type SampleDelivery = 'now' | 'phase3' | 'phase4' | 'pack5.1' | 'pack5.2' | 'pack5.3' | 'pack5.4' | 'pack5.5' | 'pack5.6' | 'pack5.7' | 'pack5.8' | 'pack5.9'

export interface SampleCategory {
  id: SampleCategoryId
  /** Earliest delivery of the category's samples (some rows mix 'now' and 'phase3'). */
  delivery: SampleDelivery
}

/** Every category, in display order. Texts: `samples:categories.<id>.{title,description}`. */
export const SAMPLE_CATEGORIES: readonly SampleCategory[] = [
  { id: 'basics', delivery: 'now' },
  { id: 'dhcp', delivery: 'now' },
  { id: 'dns', delivery: 'now' },
  { id: 'switching', delivery: 'now' },
  { id: 'routing', delivery: 'now' },
  { id: 'packetView', delivery: 'phase3' },
  { id: 'deviceCli', delivery: 'phase4' },
  { id: 'switchingAdvanced', delivery: 'pack5.1' },
  { id: 'security', delivery: 'pack5.2' },
  { id: 'dynamicRouting', delivery: 'pack5.3' },
  { id: 'ipv6', delivery: 'pack5.4' },
  { id: 'servers', delivery: 'pack5.5' },
  { id: 'wireless', delivery: 'pack5.6' },
  { id: 'wanSecurity', delivery: 'pack5.7' },
  { id: 'operations', delivery: 'pack5.8' },
  { id: 'industrial', delivery: 'pack5.9' },
]

/** Levels in display order. Texts: `samples:levels.<level>`. */
export const SAMPLE_LEVELS: readonly SampleLevel[] = ['beginner', 'intermediate', 'advanced']

/**
 * Which features the app has today. A sample needing an unavailable feature is not listed. Phase 4
 * flips `deviceCli`; every pack adds its features with `false` and flips them when it ships.
 */
export const SAMPLE_FEATURE_AVAILABILITY: Readonly<Record<SampleFeature, boolean>> = {
  simulation: true,
  dhcpRelay: true,
  dnsForwarding: true,
  deviceCli: false,
}

/** Steps a sample must have (docs/SAMPLE_LABS.md: 3–5 "try this" steps). */
export const SAMPLE_STEP_LIMITS = { min: 3, max: 5 } as const

/** localStorage key of the serialized SampleProgressBook. */
export const SAMPLE_PROGRESS_STORAGE_KEY = 'agArizaLab.samples.progress'
