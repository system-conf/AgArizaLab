import { useEffect, useState } from 'react'
import type { StepWindow } from './model/SimulationPlayer'

/**
 * Animation progress 0..1 of the current step's packets. Restarts whenever a new step window arrives;
 * jumps straight to 1 after a step back or when the learner asked for reduced motion.
 */
export function useStepProgress(stepWindow: StepWindow | null, durationMs: number, reducedMotion: boolean): number {
  const [state, setState] = useState({ serial: -1, progress: 0 })
  const animate = stepWindow !== null && stepWindow.animate && !reducedMotion && durationMs > 0
  const serial = stepWindow?.serial ?? -1

  useEffect(() => {
    if (!animate) return undefined
    let startedAt: number | null = null
    let handle = requestAnimationFrame(tick)

    function tick(now: number) {
      startedAt ??= now
      const progress = Math.min(1, (now - startedAt) / durationMs)
      setState({ serial, progress })
      if (progress < 1) handle = requestAnimationFrame(tick)
    }

    return () => cancelAnimationFrame(handle)
  }, [animate, durationMs, serial])

  if (!animate) return 1
  return state.serial === serial ? state.progress : 0
}
