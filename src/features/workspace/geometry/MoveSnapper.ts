// Snap to grid for moves on the canvas (pure, canvas units). Drags stay free while the pointer moves
// (smooth, like Packet Tracer); the finished position is snapped once, on release.
import type { CanvasPoint } from '../../../domain'
import { AlignCalculator } from './AlignCalculator'

export class MoveSnapper {
  private readonly calculator: AlignCalculator
  private readonly grid: number
  private readonly keyStep: number

  /**
   * `grid`: snap distance; `keyStep`: how far React Flow moves a focused node per arrow key press
   * when it does not snap itself (the press's distance is converted to grid steps).
   */
  constructor(grid: number, keyStep: number) {
    this.calculator = new AlignCalculator(grid)
    this.grid = grid
    this.keyStep = keyStep
  }

  /** Where a dropped node lands: the nearest grid point, or `to` itself with snapping off. */
  dragEnd(to: CanvasPoint, snap: boolean): CanvasPoint {
    return snap ? this.calculator.snap(to) : to
  }

  /**
   * An arrow-key move of a focused node from `from` to `to`: with snapping on, every key step becomes a
   * grid step and the result lies on the grid (what React Flow does with its own grid); off: unchanged.
   */
  keyMove(from: CanvasPoint, to: CanvasPoint, snap: boolean): CanvasPoint {
    if (!snap) return to
    const steps = (delta: number) => Math.round(delta / this.keyStep) * this.grid
    return this.calculator.snap({ x: from.x + steps(to.x - from.x), y: from.y + steps(to.y - from.y) })
  }
}
