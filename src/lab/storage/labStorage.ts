// The app's lab storage: IndexedDB database 'agArizaLab', object store 'labs', in-memory fallback.
import type { LabDocument } from '../../domain/v2'
import type { LabParseResult } from '../LabSerializer'
import { IdbKeyValueStore, ResilientKeyValueStore } from './LabKeyValueStore'
import { LabLibrary, newLabId, type RecentLabEntry, type StoredLab } from './LabLibrary'

const appStore = new ResilientKeyValueStore(new IdbKeyValueStore('agArizaLab', 'labs'))

/** Shared library used by useLabDocument's autosave and the recent-labs UI. */
export const labLibrary = new LabLibrary(appStore)

/** false once browser storage failed this session (show `lab:storage.unavailable`). */
export function isLabStorageAvailable(): boolean {
  return !appStore.usingFallback
}

/** The lab that was open last (pass it to useLabDocument), or null. */
export function loadAutosave(): Promise<StoredLab | null> {
  return labLibrary.loadAutosave()
}

export function listRecentLabs(): Promise<RecentLabEntry[]> {
  return labLibrary.listRecent()
}

/** Reads a recent lab; on success open it with `replace(result.doc, { labId })`. */
export function openRecentLab(labId: string): Promise<LabParseResult> {
  return labLibrary.open(labId)
}

export function deleteRecentLab(labId: string): Promise<void> {
  return labLibrary.remove(labId)
}

/** Makes a recent lab the one the workspace (`/lab`) opens next. */
export function markLabOpened(labId: string): Promise<void> {
  return labLibrary.markOpened(labId)
}

/** Saves `doc` under a new storage id (imported file, "open in lab"); the workspace opens it next. */
export async function saveLabAsNew(doc: LabDocument): Promise<StoredLab> {
  const labId = newLabId()
  return { labId, doc: await labLibrary.save(labId, doc) }
}
