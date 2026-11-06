/**
 * The simulator's only source of randomness (docs/SIMULATION.md §3.3): mulberry32 over a uint32 state
 * that lives in the snapshot, so a restored snapshot continues with the same numbers.
 */
export class SeededRandom {
  /** Initial state for a seed (any number; reduced to uint32). */
  static seed(seed: number): number {
    return Math.trunc(seed) >>> 0
  }

  /** Next value in [0, 1) and the state after it. */
  static next(state: number): { value: number; state: number } {
    const nextState = (state + 0x6d2b79f5) >>> 0
    let mixed = nextState
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return { value: ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296, state: nextState }
  }
}
