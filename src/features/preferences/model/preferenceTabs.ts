/** Tabs of the Preferences screen, in order (docs/PREFERENCES.md §6). */
export type PreferenceTab = 'appearance' | 'map' | 'simulation' | 'terminal' | 'cables' | 'language' | 'data'

export const PREFERENCE_TABS: readonly PreferenceTab[] = ['appearance', 'map', 'simulation', 'terminal', 'cables', 'language', 'data']

export type TabOrientation = 'horizontal' | 'vertical'

/**
 * The tab a key moves to (WAI-ARIA tabs pattern, like the simulation panel's `tabAfterKey`): the arrows
 * along the row or column wrap around, Home / End go to the first / last tab; null for other keys.
 * Horizontal rows follow the reading direction (in a right-to-left page Left moves forward).
 */
export function preferenceTabAfterKey(current: PreferenceTab, key: string, orientation: TabOrientation, rtl = false): PreferenceTab | null {
  const index = PREFERENCE_TABS.indexOf(current)
  const last = PREFERENCE_TABS.length - 1
  const forward = orientation === 'vertical' ? 'ArrowDown' : rtl ? 'ArrowLeft' : 'ArrowRight'
  const backward = orientation === 'vertical' ? 'ArrowUp' : rtl ? 'ArrowRight' : 'ArrowLeft'
  switch (key) {
    case forward:
      return PREFERENCE_TABS[index >= last ? 0 : index + 1] ?? null
    case backward:
      return PREFERENCE_TABS[index <= 0 ? last : index - 1] ?? null
    case 'Home':
      return PREFERENCE_TABS[0] ?? null
    case 'End':
      return PREFERENCE_TABS[last] ?? null
    default:
      return null
  }
}
