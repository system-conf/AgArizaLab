import { useEffect, useRef, type MouseEvent, type PointerEvent, type RefObject } from 'react'
import { LongPressGesture } from './LongPressGesture'

export interface LongPressHandlers {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onPointerMove: (event: PointerEvent<HTMLElement>) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onContextMenu: (event: MouseEvent<HTMLElement>) => void
}

function stopTimer(timer: RefObject<number | null>): void {
  if (timer.current !== null) window.clearTimeout(timer.current)
  timer.current = null
}

/**
 * Touch long-press on the items of a list: `handlersFor(id)` goes on each item, `onLongPress(id)`
 * runs after LongPressGesture.DELAY_MS without movement. `consumeClick()` in the item's click
 * handler returns true for the click that ends a long-press. Mouse and pen are ignored.
 */
export function useLongPress(onLongPress: (id: string) => void) {
  const gesture = useRef(new LongPressGesture())
  const timer = useRef<number | null>(null)
  const callback = useRef(onLongPress)

  useEffect(() => {
    callback.current = onLongPress
  }, [onLongPress])

  useEffect(() => () => stopTimer(timer), [])

  function handlersFor(id: string): LongPressHandlers {
    return {
      onPointerDown: (event) => {
        if (event.pointerType !== 'touch') return
        stopTimer(timer)
        gesture.current.begin(event.pointerId, event.clientX, event.clientY)
        timer.current = window.setTimeout(() => {
          timer.current = null
          if (gesture.current.fire()) callback.current(id)
        }, LongPressGesture.DELAY_MS)
      },
      onPointerMove: (event) => {
        if (gesture.current.move(event.pointerId, event.clientX, event.clientY)) stopTimer(timer)
      },
      onPointerUp: () => {
        gesture.current.cancel()
        stopTimer(timer)
      },
      onPointerCancel: () => {
        gesture.current.cancel()
        stopTimer(timer)
      },
      onContextMenu: (event) => {
        if (gesture.current.active) event.preventDefault()
      },
    }
  }

  return { handlersFor, consumeClick: () => gesture.current.consumeClick() }
}
