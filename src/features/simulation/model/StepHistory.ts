/**
 * Bounded undo stack of the simulation's step back (docs/SIMULATION.md §8): the oldest entry is
 * forgotten when the stack is full. Immutable entries; the class only keeps their order.
 */
export class StepHistory<Entry> {
  private entries: Entry[] = []
  private readonly depth: number

  constructor(depth: number) {
    if (!(depth >= 1)) throw new Error(`Step history depth must be at least 1, got ${depth}`)
    this.depth = depth
  }

  get size(): number {
    return this.entries.length
  }

  get canPop(): boolean {
    return this.entries.length > 0
  }

  push(entry: Entry): void {
    this.entries.push(entry)
    if (this.entries.length > this.depth) this.entries.shift()
  }

  pop(): Entry | undefined {
    return this.entries.pop()
  }

  clear(): void {
    this.entries = []
  }
}
