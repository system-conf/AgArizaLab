import { useCallback, useSyncExternalStore, type RefObject } from 'react'

export interface FullscreenControls {
  /** False when the browser has no Fullscreen API (e.g. iPhone Safari); hide the button then. */
  supported: boolean
  active: boolean
  toggle: () => void
}

function subscribe(onChange: () => void): () => void {
  document.addEventListener('fullscreenchange', onChange)
  return () => document.removeEventListener('fullscreenchange', onChange)
}

function isSupported(): boolean {
  return typeof document !== 'undefined' && document.fullscreenEnabled === true
}

/**
 * Fullscreen for one element (the exercise area) via the Fullscreen API. Esc exits natively;
 * `active` follows the browser, so it stays right however fullscreen was left.
 */
export function useFullscreen(target: RefObject<HTMLElement | null>): FullscreenControls {
  const element = useSyncExternalStore(subscribe, () => document.fullscreenElement, () => null)
  // The exercise area is the only element this app ever puts in fullscreen.
  const active = element !== null

  const toggle = useCallback(() => {
    const current = target.current
    if (!current) return
    const request = document.fullscreenElement ? document.exitFullscreen() : current.requestFullscreen()
    request.catch((error: unknown) => {
      console.warn('Could not toggle fullscreen.', error)
    })
  }, [target])

  return { supported: isSupported(), active, toggle }
}
