import { useCallback, useEffect, useRef, useState } from 'react'

export type ToastTone = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  text: string
  tone: ToastTone
}

export interface ToastControls {
  toasts: readonly Toast[]
  show: (text: string, tone: ToastTone) => void
  dismiss: (id: number) => void
}

const TOAST_MS = 4500
const MAX_TOASTS = 3

/** Short-lived messages (cable refusals, confirmations); each closes itself after a few seconds. */
export function useToasts(): ToastControls {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) clearTimeout(timer)
    timers.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback(
    (text: string, tone: ToastTone) => {
      const id = nextId.current
      nextId.current += 1
      setToasts((current) => [...current, { id, text, tone }].slice(-MAX_TOASTS))
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TOAST_MS),
      )
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  return { toasts, show, dismiss }
}
