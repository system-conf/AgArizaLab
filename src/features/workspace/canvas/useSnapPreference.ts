import { useCallback } from 'react'
import { usePreference } from '../../../preferences'

/**
 * Snap to grid (off by default), the `map.snap` preference: remembered across visits and tabs;
 * `toggle` flips and saves it. (The old key agArizaLab.workspace.snap is migrated by PreferencesStore.)
 */
export function useSnapPreference(): { snapToGrid: boolean; toggle: () => void } {
  const [snapToGrid, setSnap] = usePreference('map.snap')
  const toggle = useCallback(() => setSnap(!snapToGrid), [snapToGrid, setSnap])
  return { snapToGrid, toggle }
}
