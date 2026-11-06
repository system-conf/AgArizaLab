// Undo / redo over immutable lab documents. A LabHistory is itself immutable: every operation returns
// a new history (or the same one when nothing changes), which makes it a plain React state value.
import type { LabDocument } from '../domain'

export const DEFAULT_HISTORY_LIMIT = 200

export class LabHistory<Doc extends object = LabDocument> {
  /** Oldest first; at most `limit` entries. */
  readonly past: readonly Doc[]
  readonly present: Doc
  /** Next redo first. */
  readonly future: readonly Doc[]
  readonly limit: number
  /** coalesceKey of the step that produced `present`; null after undo / redo / start. */
  private readonly lastKey: string | null

  private constructor(past: readonly Doc[], present: Doc, future: readonly Doc[], limit: number, lastKey: string | null) {
    this.past = past
    this.present = present
    this.future = future
    this.limit = limit
    this.lastKey = lastKey
  }

  /** A history without undo / redo steps. `limit`: number of undo steps kept (≥ 1). */
  static start<Doc extends object>(doc: Doc, limit: number = DEFAULT_HISTORY_LIMIT): LabHistory<Doc> {
    if (!Number.isInteger(limit) || limit < 1) throw new Error(`History limit must be a positive integer: ${limit}`)
    return new LabHistory<Doc>([], doc, [], limit, null)
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  /**
   * Records `doc` as the new present and clears redo. The same object as `present` is a no-op.
   * Consecutive pushes with the same `coalesceKey` (e.g. one per drag gesture) form one undo step.
   */
  push(doc: Doc, coalesceKey?: string): LabHistory<Doc> {
    if (doc === this.present) return this
    const key = coalesceKey ?? null
    if (key !== null && key === this.lastKey) return new LabHistory(this.past, doc, [], this.limit, key)
    const past = [...this.past, this.present].slice(-this.limit)
    return new LabHistory(past, doc, [], this.limit, key)
  }

  undo(): LabHistory<Doc> {
    const previous = this.past.at(-1)
    if (previous === undefined) return this
    return new LabHistory(this.past.slice(0, -1), previous, [this.present, ...this.future], this.limit, null)
  }

  redo(): LabHistory<Doc> {
    const [next, ...rest] = this.future
    if (next === undefined) return this
    return new LabHistory([...this.past, this.present].slice(-this.limit), next, rest, this.limit, null)
  }

  /**
   * Every document (past, present, future) passed through `rewrite`, without adding an undo step,
   * e.g. relabelling an exercise lab in another language so undo never brings old names back.
   */
  map(rewrite: (doc: Doc) => Doc): LabHistory<Doc> {
    return new LabHistory(this.past.map(rewrite), rewrite(this.present), this.future.map(rewrite), this.limit, this.lastKey)
  }

  /** Same limit, new document, no undo / redo (opening another lab). */
  reset(doc: Doc): LabHistory<Doc> {
    return new LabHistory<Doc>([], doc, [], this.limit, null)
  }
}
