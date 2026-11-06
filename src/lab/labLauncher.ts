// Lab entry points for screens outside the workspace (landing page, solution report). Load it
// with `import('…/lab/labLauncher')` so zod and the IndexedDB code stay out of the landing chunk.
// Every function leaves the lab to open in the autosave pointer; the workspace (`/lab`) opens it.
import type { LocalizedMessage } from '../domain/Messages'
import { importLabFile } from './labFiles'
import { saveLabAsNew } from './storage/labStorage'

export { deleteRecentLab, isLabStorageAvailable, listRecentLabs, markLabOpened, saveLabAsNew } from './storage/labStorage'

export type LabImportResult = { ok: true; labId: string } | { ok: false; errors: LocalizedMessage[] }

/** Reads, validates (and upgrades) a picked `.agl.json` file and stores it as a new lab. */
export async function importLabAsNew(file: Blob): Promise<LabImportResult> {
  const parsed = await importLabFile(file)
  if (!parsed.ok) return parsed
  const stored = await saveLabAsNew(parsed.doc)
  return { ok: true, labId: stored.labId }
}
