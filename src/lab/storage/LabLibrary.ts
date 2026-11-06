// Saved labs in the browser: the autosaved current lab plus the "recent labs" list. Every stored
// document goes through the LabSerializer when it is read back, so a damaged or outdated entry is
// migrated or reported, never trusted blindly.
import { z } from 'zod'
import type { LabDocument } from '../../domain'
import { localizedMessage } from '../../i18n/messageKeys'
import { labSerializer, type LabParseResult, type LabSerializer } from '../LabSerializer'
import type { LabKeyValueStore } from './LabKeyValueStore'

/** Most recent labs kept; older ones are deleted when a new lab is saved. */
export const MAX_RECENT_LABS = 20

export interface RecentLabEntry {
  /** Storage id of the lab (not part of the document). */
  id: string
  /** User content; '' = untitled (`lab:untitled`). */
  title: string
  /** ISO 8601. */
  updatedAt: string
}

/** A lab with the storage id it is autosaved under. */
export interface StoredLab {
  labId: string
  doc: LabDocument
}

const AUTOSAVE_KEY = 'autosave'
const INDEX_KEY = 'recentLabs'

function documentKey(labId: string): string {
  return `lab.${labId}`
}

const indexSchema = z.array(z.object({ id: z.string().min(1), title: z.string(), updatedAt: z.string() }))
const autosaveSchema = z.object({ labId: z.string().min(1) })

/** New storage id, e.g. 'labm1abcd2x9f3k' (camelCase-safe: letters and digits only). */
export function newLabId(now: Date = new Date(), random: () => number = Math.random): string {
  const suffix = Math.floor(random() * 36 ** 6).toString(36).padStart(6, '0')
  return `lab${now.getTime().toString(36)}${suffix}`
}

export class LabLibrary {
  private readonly store: LabKeyValueStore
  private readonly serializer: LabSerializer
  private readonly clock: () => Date

  constructor(store: LabKeyValueStore, serializer: LabSerializer = labSerializer, clock: () => Date = () => new Date()) {
    this.store = store
    this.serializer = serializer
    this.clock = clock
  }

  /**
   * Saves `doc` under `labId` with `meta.updatedAt` = now, makes it the autosaved lab and moves it
   * to the top of the recent list. Returns the stored document.
   */
  async save(labId: string, doc: LabDocument): Promise<LabDocument> {
    const updatedAt = this.clock().toISOString()
    const stored: LabDocument = { ...doc, meta: { ...doc.meta, updatedAt } }
    await this.store.set(documentKey(labId), this.serializer.serialize(stored))
    await this.store.set(AUTOSAVE_KEY, { labId })
    const entry: RecentLabEntry = { id: labId, title: stored.meta.title, updatedAt }
    const index = [entry, ...(await this.listRecent()).filter((existing) => existing.id !== labId)]
    for (const dropped of index.slice(MAX_RECENT_LABS)) await this.store.delete(documentKey(dropped.id))
    await this.store.set(INDEX_KEY, index.slice(0, MAX_RECENT_LABS))
    return stored
  }

  /**
   * Makes a stored lab the one the workspace reopens (autosave pointer) without saving it again,
   * so its "last changed" time and its place in the recent list stay as they are.
   */
  async markOpened(labId: string): Promise<void> {
    await this.store.set(AUTOSAVE_KEY, { labId })
  }

  /** The lab that was open last, or null (nothing saved, or the entry is unusable). */
  async loadAutosave(): Promise<StoredLab | null> {
    const pointer = autosaveSchema.safeParse(await this.store.get(AUTOSAVE_KEY))
    if (!pointer.success) return null
    const result = await this.open(pointer.data.labId)
    if (result.ok) return { labId: pointer.data.labId, doc: result.doc }
    console.warn('The autosaved lab could not be loaded.', result.errors)
    return null
  }

  /** Newest first. */
  async listRecent(): Promise<RecentLabEntry[]> {
    const stored = await this.store.get(INDEX_KEY)
    if (stored === undefined) return []
    const index = indexSchema.safeParse(stored)
    if (index.success) return index.data
    console.warn('The recent labs list is damaged and was ignored.', index.error)
    return []
  }

  async open(labId: string): Promise<LabParseResult> {
    const stored = await this.store.get(documentKey(labId))
    if (stored === undefined) return { ok: false, errors: [localizedMessage('lab:recent.notFound')] }
    return this.serializer.parse(stored)
  }

  /** Deletes the lab and its recent entry (and the autosave pointer when it pointed at it). */
  async remove(labId: string): Promise<void> {
    await this.store.delete(documentKey(labId))
    const index = await this.listRecent()
    await this.store.set(INDEX_KEY, index.filter((entry) => entry.id !== labId))
    const pointer = autosaveSchema.safeParse(await this.store.get(AUTOSAVE_KEY))
    if (pointer.success && pointer.data.labId === labId) await this.store.delete(AUTOSAVE_KEY)
  }
}
