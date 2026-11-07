import { useReactFlow, type FitViewOptions, type OnMove } from '@xyflow/react'
import { useCallback, useEffect, useRef, type RefObject } from 'react'

export interface ViewportMotion {
  onMoveStart: OnMove
  onMoveEnd: OnMove
}

const VIEWPORT_SELECTOR = '.react-flow__viewport'

/** The viewport layer as its own compositor layer (or back): a pan then moves pixels instead of repainting. */
function promoteViewport(container: HTMLElement | null, promoted: boolean): void {
  const viewport = container?.querySelector<HTMLElement>(VIEWPORT_SELECTOR)
  if (viewport) viewport.style.willChange = promoted ? 'transform' : ''
}

/**
 * Pan and zoom handling of the canvas (docs/CANVAS_PERFORMANCE.md):
 * - while the view moves, the viewport layer is promoted (`will-change: transform`), so panning only
 *   moves the painted layer; at the end it is repainted sharp at the new zoom. Set on the element
 *   directly: no React render per move.
 * - `refitOnResize`: when the canvas changes size (e.g. on a phone, the exercise footer grows with the
 *   failed-check list) the view is fitted to the lab again, unless the learner panned or zoomed since.
 */
export function useViewportMotion(canvasRef: RefObject<HTMLDivElement | null>, refitOnResize: boolean, fitOptions: FitViewOptions): ViewportMotion {
  const flow = useReactFlow()
  const userMoved = useRef(false)

  const onMoveStart = useCallback<OnMove>(
    (event) => {
      promoteViewport(canvasRef.current, true)
      // Programmatic moves (fit view) come without an event.
      if (event) userMoved.current = true
    },
    [canvasRef],
  )
  const onMoveEnd = useCallback<OnMove>(() => promoteViewport(canvasRef.current, false), [canvasRef])

  useEffect(() => {
    const container = canvasRef.current
    if (!refitOnResize || !container || typeof ResizeObserver === 'undefined') return undefined
    let size: { width: number; height: number } | null = null
    let frame = 0
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      const previous = size
      size = { width, height }
      if (previous === null || (previous.width === width && previous.height === height)) return
      if (userMoved.current || width === 0 || height === 0) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => void flow.fitView(fitOptions))
    })
    observer.observe(container)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [canvasRef, fitOptions, flow, refitOnResize])

  return { onMoveStart, onMoveEnd }
}
