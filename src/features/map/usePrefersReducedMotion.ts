import { useMediaQuery } from '../shared/useMediaQuery'

/** True when the learner asked the system for less motion. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}
