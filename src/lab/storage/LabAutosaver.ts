// Debounced autosave: many quick edits (a drag, typing) become one write after a quiet period.
// Save failures are logged with console.warn; the lab stays in memory and editing continues.
import type { LabDocument } from '../../domain/v2'
import type { LabLibrary } from './LabLibrary'

export const AUTOSAVE_DELAY_MS = 800

interface PendingSave {
  labId: string
  doc: LabDocument
}

/** Runs callback after delayMs; returns a function that cancels it. Injectable for tests. */
export type DelayScheduler = (callback: () => void, delayMs: number) => () => void

const browserScheduler: DelayScheduler = (callback, delayMs) => {
  const handle = globalThis.setTimeout(callback, delayMs)
  return () => globalThis.clearTimeout(handle)
}

export class LabAutosaver {
  private readonly library: LabLibrary
  private readonly delayMs: number
  private readonly scheduler: DelayScheduler
  private pending: PendingSave | null = null
  private cancelTimer: (() => void) | null = null
  private writing: Promise<void> = Promise.resolve()

  constructor(library: LabLibrary, delayMs: number = AUTOSAVE_DELAY_MS, scheduler: DelayScheduler = browserScheduler) {
    this.library = library
    this.delayMs = delayMs
    this.scheduler = scheduler
  }

  /** Saves `doc` after the delay unless another schedule replaces it first. */
  schedule(labId: string, doc: LabDocument): void {
    this.pending = { labId, doc }
    this.cancelTimer?.()
    this.cancelTimer = this.scheduler(() => {
      void this.flush()
    }, this.delayMs)
  }

  /** Writes the pending document now (page hide, unmount). Resolves when every write has finished. */
  flush(): Promise<void> {
    this.cancelTimer?.()
    this.cancelTimer = null
    const pending = this.pending
    this.pending = null
    if (pending !== null) {
      this.writing = this.writing.then(() => this.write(pending))
    }
    return this.writing
  }

  private async write(pending: PendingSave): Promise<void> {
    try {
      await this.library.save(pending.labId, pending.doc)
    } catch (error) {
      console.warn('Autosave failed; the lab is kept in memory.', error)
    }
  }
}
