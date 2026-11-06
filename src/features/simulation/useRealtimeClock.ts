import { useEffect } from 'react'
import type { SimulationPlayer } from './model/SimulationPlayer'

/**
 * Realtime mode (docs/SIMULATION.md §5.5): wall time maps 1:1 to virtual time from the moment the
 * mode starts; every animation frame runs the engine up to "now". The player tells React only
 * when something happened, so an idle network costs no renders. Pass null to stop the clock.
 */
export function useRealtimeClock(player: SimulationPlayer | null): void {
  useEffect(() => {
    if (!player) return undefined
    const virtualStart = player.time
    const wallStart = performance.now()
    let handle = window.requestAnimationFrame(tick)

    function tick(now: number) {
      player?.advanceTo(virtualStart + Math.max(0, now - wallStart))
      handle = window.requestAnimationFrame(tick)
    }

    return () => window.cancelAnimationFrame(handle)
  }, [player])
}
