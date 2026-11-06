import { useCallback, useState } from 'react'
import { SnapPreference } from './SnapPreference'

/** Snap to grid (off by default), remembered across visits; `toggle` flips and saves it. */
export function useSnapPreference(): { snapToGrid: boolean; toggle: () => void } {
  const [store] = useState(() => SnapPreference.fromBrowser())
  const [snapToGrid, setSnapToGrid] = useState(() => store.read())
  const toggle = useCallback(() => {
    store.write(!snapToGrid)
    setSnapToGrid(!snapToGrid)
  }, [snapToGrid, store])
  return { snapToGrid, toggle }
}
