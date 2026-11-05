import { useEffect, useState } from 'react'

const visibleMs = 2500

/**
 * Remembers which settings group was saved last and forgets it after a short delay,
 * so the UI can show a brief "Kaydedildi" confirmation next to that group.
 */
export function useSavedFlash<Key extends string>() {
  // `stamp` restarts the timer when the same group is saved twice in a row.
  const [flash, setFlash] = useState<{ key: Key; stamp: number } | null>(null)

  useEffect(() => {
    if (flash === null) return
    const timer = window.setTimeout(() => setFlash(null), visibleMs)
    return () => window.clearTimeout(timer)
  }, [flash])

  return {
    savedKey: flash?.key ?? null,
    markSaved: (key: Key) => setFlash({ key, stamp: Date.now() }),
  }
}
