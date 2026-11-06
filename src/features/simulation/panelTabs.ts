/** Tabs of the simulation panel on phones, in order. */
export type PanelTab = 'events' | 'inspector'

export const PANEL_TABS: readonly PanelTab[] = ['events', 'inspector']

/**
 * The tab a key moves to in the horizontal tab row (WAI-ARIA tabs pattern): Left / Right wrap around,
 * Home / End go to the first / last tab; null for other keys. In a right-to-left page the arrows point
 * the other way along the row.
 */
export function tabAfterKey(current: PanelTab, key: string, rtl = false): PanelTab | null {
  const index = PANEL_TABS.indexOf(current)
  const last = PANEL_TABS.length - 1
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
  const backward = rtl ? 'ArrowRight' : 'ArrowLeft'
  switch (key) {
    case forward:
      return PANEL_TABS[index >= last ? 0 : index + 1] ?? null
    case backward:
      return PANEL_TABS[index <= 0 ? last : index - 1] ?? null
    case 'Home':
      return PANEL_TABS[0] ?? null
    case 'End':
      return PANEL_TABS[last] ?? null
    default:
      return null
  }
}
