import { useEffect } from 'react'
import type { SimulationPlayer } from './model/SimulationPlayer'

/**
 * Realtime mode (docs/SIMULATION.md §5.5): wall time maps 1:1 to virtual time; every animation frame
 * runs the engine on by the wall time that passed since the previous frame. A terminal command that
 * jumped the clock ahead therefore never stalls it. The player tells React only when something
 * happened, so an idle network costs no renders. Pass null to stop the clock.
 */
export function useRealtimeClock(player: SimulationPlayer | null): void {
  useEffect(() => {
    if (!player) return undefined
    let last = performance.now()
    let handle = window.requestAnimationFrame(tick)

    function tick(now: number) {
      const elapsed = Math.max(0, now - last)
      last = now
      player?.advanceTo(player.time + elapsed)
      handle = window.requestAnimationFrame(tick)
    }

    return () => window.cancelAnimationFrame(handle)
  }, [player])
}
