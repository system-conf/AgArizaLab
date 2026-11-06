import { useEffect, useState } from 'react'

/** `flag`, but turning true only after it stayed true for `delayMs` (no flash for quick work). */
export function useDelayedFlag(flag: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!flag) return undefined
    const timer = window.setTimeout(() => setShown(true), delayMs)
    return () => {
      window.clearTimeout(timer)
      setShown(false)
    }
  }, [delayMs, flag])
  return flag && shown
}
