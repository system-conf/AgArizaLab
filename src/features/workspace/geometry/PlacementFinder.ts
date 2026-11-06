// Where to put a new item: the wanted point, or the nearest free spot so items (and the device
// names hanging below the icons) never overlap.
import type { CanvasPoint } from '../../../domain/v2'

/** Minimum distance between the top-left points of two items, per axis. */
export interface Spacing {
  x: number
  y: number
}

export class PlacementFinder {
  private readonly spacing: Spacing
  private readonly maxTries: number

  /**
   * `spacing`: an item is free when every other item is at least `spacing.x` away horizontally or
   * `spacing.y` vertically; candidate spots are that far apart. A number means the same in both axes.
   */
  constructor(spacing: Spacing | number, maxTries = 64) {
    this.spacing = typeof spacing === 'number' ? { x: spacing, y: spacing } : spacing
    this.maxTries = maxTries
  }

  /**
   * `wanted` when no occupied point is too close; otherwise the first free spot on square rings
   * around it (each ring tries right / down before left / up). Gives up after `maxTries` and
   * returns `wanted` (stacking is harmless, just untidy).
   */
  find(wanted: CanvasPoint, occupied: readonly CanvasPoint[]): CanvasPoint {
    for (const candidate of this.candidates(wanted)) {
      if (this.isFree(candidate, occupied)) return candidate
    }
    return wanted
  }

  private isFree(point: CanvasPoint, occupied: readonly CanvasPoint[]): boolean {
    return occupied.every((other) => Math.abs(other.x - point.x) >= this.spacing.x || Math.abs(other.y - point.y) >= this.spacing.y)
  }

  private *candidates(wanted: CanvasPoint): Generator<CanvasPoint> {
    yield wanted
    let tries = 1
    for (let ring = 1; tries < this.maxTries; ring += 1) {
      for (const [dx, dy] of this.ring(ring)) {
        tries += 1
        yield { x: wanted.x + dx * this.spacing.x, y: wanted.y + dy * this.spacing.y }
      }
    }
  }

  /** Offsets on the square ring `ring` around the origin, right / down first. */
  private ring(ring: number): [number, number][] {
    const offsets: [number, number][] = []
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) offsets.push([dx, dy])
      }
    }
    const cost = ([dx, dy]: [number, number]) => (dx < 0 ? 2 : 0) + (dy < 0 ? 1 : 0) + Math.abs(dx) + Math.abs(dy)
    return offsets.sort((first, second) => cost(first) - cost(second))
  }
}
