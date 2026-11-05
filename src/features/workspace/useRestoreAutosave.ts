import { useEffect, useRef } from 'react'
import { loadAutosave, type LabDocumentState } from './labServices'

/**
 * Reopens the last autosaved lab once on mount, unless the user already started editing the
 * empty lab meanwhile (their work wins).
 */
export function useRestoreAutosave(lab: LabDocumentState): void {
  const edited = useRef(lab.canUndo)
  const replace = useRef(lab.replace)
  useEffect(() => {
    edited.current = lab.canUndo
    replace.current = lab.replace
  })

  useEffect(() => {
    let active = true
    loadAutosave().then(
      (stored) => {
        if (active && stored !== null && !edited.current) replace.current(stored.doc, { labId: stored.labId })
      },
      (error: unknown) => console.warn('The autosaved lab could not be read.', error),
    )
    return () => {
      active = false
    }
  }, [])
}
