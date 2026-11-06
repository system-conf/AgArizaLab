import { useCallback, useEffect, useState } from 'react'
import type { RecentLabEntry } from '../../lab/storage/LabLibrary'
import { loadLabLauncher } from './labLauncherLoader'

export interface RecentLabs {
  /** null while loading. */
  entries: readonly RecentLabEntry[] | null
  /** false once browser storage failed (labs then live only until the tab is closed). */
  storageAvailable: boolean
  remove: (labId: string) => void
}

/** The recent labs list from browser storage; deleting updates the list. */
export function useRecentLabs(): RecentLabs {
  const [entries, setEntries] = useState<readonly RecentLabEntry[] | null>(null)
  const [storageAvailable, setStorageAvailable] = useState(true)

  const reload = useCallback(async () => {
    const launcher = await loadLabLauncher()
    const list = await launcher.listRecentLabs()
    return { list, available: launcher.isLabStorageAvailable() }
  }, [])

  useEffect(() => {
    let active = true
    reload().then(
      ({ list, available }) => {
        if (!active) return
        setEntries(list)
        setStorageAvailable(available)
      },
      (error: unknown) => {
        console.warn('The recent labs could not be read.', error)
        if (active) setEntries([])
      },
    )
    return () => {
      active = false
    }
  }, [reload])

  const remove = useCallback(
    (labId: string) => {
      setEntries((current) => current?.filter((entry) => entry.id !== labId) ?? null)
      loadLabLauncher()
        .then((launcher) => launcher.deleteRecentLab(labId))
        .then(reload)
        .then(
          ({ list }) => setEntries(list),
          (error: unknown) => console.warn(`The lab ${labId} could not be deleted.`, error),
        )
    },
    [reload],
  )

  return { entries, storageAvailable, remove }
}
