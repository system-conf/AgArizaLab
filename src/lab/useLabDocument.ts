// React state of the open lab: the document, undo / redo (LabHistory) and debounced autosave to
// IndexedDB (LabAutosaver → LabLibrary). The document is saved once the user changed it (apply,
// undo, redo); merely opening a lab does not create a recent-labs entry.
import { useCallback, useEffect, useState } from 'react'
import type { LabDocument } from '../domain/v2'
import { createEmptyLab } from './createLab'
import { LabHistory } from './LabHistory'
import { LabAutosaver } from './storage/LabAutosaver'
import { newLabId, type LabLibrary } from './storage/LabLibrary'
import { labLibrary } from './storage/labStorage'

export interface ApplyOptions {
  /** Consecutive applies with the same key form one undo step (e.g. `move:<gesture id>`). */
  coalesceKey?: string
}

export interface ReplaceOptions {
  /** Storage id to autosave under (an opened recent lab); default: a new id. */
  labId?: string
}

export interface UseLabDocumentOptions {
  /** Storage id of `initial` (from loadAutosave); default: a new id. */
  labId?: string
  /** Default true. */
  autosave?: boolean
  /** Default: the app's IndexedDB library. Read once on mount. */
  library?: LabLibrary
}

export interface LabDocumentState {
  doc: LabDocument
  /** Storage id the lab is autosaved under. */
  labId: string
  /** `update` must be pure (LabEditor methods); returning the same document is a no-op. */
  apply(update: (doc: LabDocument) => LabDocument, options?: ApplyOptions): void
  /** Opens another document: clears undo / redo. */
  replace(doc: LabDocument, options?: ReplaceOptions): void
  undo(): void
  redo(): void
  canUndo: boolean
  canRedo: boolean
}

interface LabSession {
  history: LabHistory
  labId: string
  /** The user changed the document since it was opened. */
  edited: boolean
}

function nextSession(current: LabSession, history: LabHistory): LabSession {
  return history === current.history ? current : { ...current, history, edited: true }
}

export function useLabDocument(initial?: LabDocument, options: UseLabDocumentOptions = {}): LabDocumentState {
  const [session, setSession] = useState<LabSession>(() => ({
    history: LabHistory.start(initial ?? createEmptyLab()),
    labId: options.labId ?? newLabId(),
    edited: false,
  }))
  const [autosaver] = useState(() => new LabAutosaver(options.library ?? labLibrary))
  const autosave = options.autosave ?? true
  const doc = session.history.present

  useEffect(() => {
    if (autosave && session.edited) autosaver.schedule(session.labId, doc)
  }, [autosave, autosaver, doc, session.edited, session.labId])

  useEffect(() => {
    const flush = (): void => {
      void autosaver.flush()
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [autosaver])

  const apply = useCallback((update: (doc: LabDocument) => LabDocument, applyOptions?: ApplyOptions) => {
    setSession((current) =>
      nextSession(current, current.history.push(update(current.history.present), applyOptions?.coalesceKey)),
    )
  }, [])

  const replace = useCallback(
    (next: LabDocument, replaceOptions?: ReplaceOptions) => {
      void autosaver.flush()
      const labId = replaceOptions?.labId ?? newLabId()
      setSession((current) => ({ history: current.history.reset(next), labId, edited: false }))
    },
    [autosaver],
  )

  const undo = useCallback(() => setSession((current) => nextSession(current, current.history.undo())), [])
  const redo = useCallback(() => setSession((current) => nextSession(current, current.history.redo())), [])

  return {
    doc,
    labId: session.labId,
    apply,
    replace,
    undo,
    redo,
    canUndo: session.history.canUndo,
    canRedo: session.history.canRedo,
  }
}
