// Arrow-key movement in a grid of palette tiles (roving focus): left / right step one tile,
// up / down one row, Home / End jump to the ends. Stays put at the edges (no wrap-around).

export type GridKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'

export function isGridKey(key: string): key is GridKey {
  return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown' || key === 'Home' || key === 'End'
}

export class GridNavigation {
  /**
   * Index the focus moves to from `current` in a grid of `count` tiles with `columns` columns.
   * `rtl`: left / right are mirrored (right-to-left layout).
   */
  static next(current: number, key: GridKey, count: number, columns: number, rtl = false): number {
    if (count <= 0) return 0
    const width = Math.max(1, Math.floor(columns))
    const clamp = (index: number) => Math.min(count - 1, Math.max(0, index))
    switch (key) {
      case 'ArrowLeft':
        return clamp(current + (rtl ? 1 : -1))
      case 'ArrowRight':
        return clamp(current + (rtl ? -1 : 1))
      case 'ArrowUp':
        return current - width >= 0 ? current - width : current
      case 'ArrowDown':
        return current + width < count ? current + width : current
      case 'Home':
        return 0
      case 'End':
        return count - 1
    }
  }
}
