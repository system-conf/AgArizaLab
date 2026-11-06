/**
 * An append-only log of numbered records (events, transmissions) that keeps the newest `limit`.
 * Ids grow with every append, so lookups are binary searches. The oldest records are trimmed in
 * batches (when the log holds half a limit too many), so appending stays O(1) amortized; readers
 * never see more than `limit` records.
 */
export class RetainedLog<Entry extends { readonly id: number }> {
  private entries: Entry[] = []
  private readonly limit: number

  constructor(limit: number) {
    this.limit = Math.max(0, Math.floor(limit))
  }

  append(added: readonly Entry[]): void {
    for (const entry of added) this.entries.push(entry)
    if (this.entries.length > this.limit + Math.max(1, Math.floor(this.limit / 2))) {
      this.entries = this.entries.slice(this.entries.length - this.limit)
    }
  }

  /** Retained records with `id >= fromId` (at most `limit`, oldest first). */
  from(fromId: number): Entry[] {
    const start = Math.max(this.indexOf(fromId), this.entries.length - this.limit, 0)
    return this.entries.slice(start)
  }

  /** Forgets every record with `id >= nextId` (restore of an earlier snapshot). */
  truncate(nextId: number): void {
    const end = this.indexOf(nextId)
    if (end < this.entries.length) this.entries = this.entries.slice(0, end)
  }

  clear(): void {
    this.entries = []
  }

  /** First index whose id is `>= id`. */
  private indexOf(id: number): number {
    let low = 0
    let high = this.entries.length
    while (low < high) {
      const middle = (low + high) >>> 1
      const entry = this.entries[middle]
      if (entry !== undefined && entry.id < id) low = middle + 1
      else high = middle
    }
    return low
  }
}
