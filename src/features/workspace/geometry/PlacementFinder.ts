// Where to put a new device: the wanted point, or the nearest free spot so devices never stack.
import type { CanvasPoint } from '../../../domain/v2'

export class PlacementFinder {
  private readonly step: number
  private readonly maxTries: number

  /** `step`: distance between candidate spots (also the minimum gap between two devices). */
  constructor(step: number, maxTries = 64) {
    this.step = step
    this.maxTries = maxTries
  }

  /**
   * `wanted` when no occupied point is closer than `step` in both axes; otherwise the first free
   * spot on square rings around it (each ring tries right / down before left / up). Gives up after
   * `maxTries` and returns `wanted` (stacking is harmless, just untidy).
   */
  find(wanted: CanvasPoint, occupied: readonly CanvasPoint[]): CanvasPoint {
    for (const candidate of this.candidates(wanted)) {
      if (this.isFree(candidate, occupied)) return candidate
    }
    return wanted
  }

  private isFree(point: CanvasPoint, occupied: readonly CanvasPoint[]): boolean {
    return occupied.every((other) => Math.abs(other.x - point.x) >= this.step || Math.abs(other.y - point.y) >= this.step)
  }

  private *candidates(wanted: CanvasPoint): Generator<CanvasPoint> {
    yield wanted
    let tries = 1
    for (let ring = 1; tries < this.maxTries; ring += 1) {
      for (const [dx, dy] of this.ring(ring)) {
        tries += 1
        yield { x: wanted.x + dx * this.step, y: wanted.y + dy * this.step }
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
