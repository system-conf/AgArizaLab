// Canvas geometry for the selection: align, nudge and snap (pure, canvas units).
import type { CanvasPoint } from '../../../domain'

export type AlignMode = 'left' | 'center' | 'top'

export interface PlacedItem {
  id: string
  /** Top-left corner. */
  x: number
  y: number
  width: number
  height: number
}

export interface ItemMove {
  id: string
  to: CanvasPoint
}

export class AlignCalculator {
  private readonly grid: number

  /** `grid`: snap distance in canvas units. */
  constructor(grid: number) {
    this.grid = grid
  }

  /**
   * Moves that align the items: left edges on the leftmost edge, top edges on the topmost edge,
   * or horizontal centres on the centre of the selection's bounding box. Items already in place
   * are left out; fewer than two items → no moves.
   */
  align(items: readonly PlacedItem[], mode: AlignMode): ItemMove[] {
    if (items.length < 2) return []
    const targets = items.map((item) => ({ item, to: this.alignedPosition(items, item, mode) }))
    return targets
      .filter(({ item, to }) => to.x !== item.x || to.y !== item.y)
      .map(({ item, to }) => ({ id: item.id, to }))
  }

  /** Every item moved by (dx, dy). */
  nudge(items: readonly PlacedItem[], dx: number, dy: number): ItemMove[] {
    if (dx === 0 && dy === 0) return []
    return items.map((item) => ({ id: item.id, to: { x: item.x + dx, y: item.y + dy } }))
  }

  /** Nearest grid point. */
  snap(point: CanvasPoint): CanvasPoint {
    return { x: this.snapValue(point.x), y: this.snapValue(point.y) }
  }

  private snapValue(value: number): number {
    // `+ 0` turns -0 into 0 so snapped values compare equal in tests and storage.
    return Math.round(value / this.grid) * this.grid + 0
  }

  private alignedPosition(items: readonly PlacedItem[], item: PlacedItem, mode: AlignMode): CanvasPoint {
    switch (mode) {
      case 'left':
        return { x: Math.min(...items.map((candidate) => candidate.x)), y: item.y }
      case 'top':
        return { x: item.x, y: Math.min(...items.map((candidate) => candidate.y)) }
      case 'center': {
        const left = Math.min(...items.map((candidate) => candidate.x))
        const right = Math.max(...items.map((candidate) => candidate.x + candidate.width))
        return { x: (left + right) / 2 - item.width / 2, y: item.y }
      }
    }
  }
}
