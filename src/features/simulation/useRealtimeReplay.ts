import { useEffect, useState } from 'react'
import { MAX_REPLAY_HOPS, REPLAY_HOP_MS, type RealtimeReplay } from './model/RealtimeReplay'
import type { StepWindow } from './model/SimulationPlayer'

/** The last hop stays on the map this long (a red ✕ where the packet was dropped stays readable). */
const FINAL_HOLD_MS = 1200

/** A replay together with its number: two runs with the same frames still replay twice. */
export interface NumberedReplay {
  readonly replay: RealtimeReplay
  readonly id: number
}

/** The hop on the map now: its window (as a simulation step) and the frames of the replay. */
export interface ReplayFrame {
  readonly window: StepWindow
  readonly replay: RealtimeReplay
}

/**
 * Plays a realtime replay hop by hop (`REPLAY_HOP_MS` each), then clears it. Nothing is shown with
 * `disabled` (reduced motion: the realtime animation is skipped, as before).
 */
export function useRealtimeReplay(numbered: NumberedReplay | null, disabled: boolean): ReplayFrame | null {
  const [position, setPosition] = useState<{ numbered: NumberedReplay | null; index: number }>({ numbered: null, index: 0 })
  const index = position.numbered === numbered ? position.index : 0
  const hops = numbered?.replay.hops ?? []

  useEffect(() => {
    if (!numbered || disabled || index >= hops.length) return undefined
    const delay = index === hops.length - 1 ? REPLAY_HOP_MS + FINAL_HOLD_MS : REPLAY_HOP_MS
    const timer = window.setTimeout(() => setPosition({ numbered, index: index + 1 }), delay)
    return () => window.clearTimeout(timer)
  }, [disabled, hops.length, index, numbered])

  const hop = hops[index]
  if (!numbered || disabled || !hop) return null
  // Negative serials never meet the player's step serials.
  const serial = -(numbered.id * (MAX_REPLAY_HOPS + 1) + index + 1)
  return { window: { from: hop.from, to: hop.to, serial, animate: true }, replay: numbered.replay }
}
