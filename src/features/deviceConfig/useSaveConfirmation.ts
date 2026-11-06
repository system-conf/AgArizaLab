import { useEffect, useState } from 'react'
import type { Device } from '../../domain'

const visibleMs = 2500

/**
 * "Saved" confirmation per card. The parent may refuse a change (LabEditor.updateDevice returns
 * the document unchanged), so a card counts as saved only once the device the panel receives
 * equals the device it handed out, and no problems are reported.
 */
export function useSaveConfirmation<Key extends string>(device: Device, problemCount: number) {
  const [pending, setPending] = useState<{ key: Key; expected: string } | null>(null)

  useEffect(() => {
    if (pending === null) return
    const timer = window.setTimeout(() => setPending(null), visibleMs)
    return () => window.clearTimeout(timer)
  }, [pending])

  const savedKey = pending !== null && problemCount === 0 && JSON.stringify(device) === pending.expected ? pending.key : null

  return {
    savedKey,
    expectSaved: (key: Key, next: Device) => setPending({ key, expected: JSON.stringify(next) }),
  }
}
