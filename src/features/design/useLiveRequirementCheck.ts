import { useEffect, useRef, useState } from 'react'
import type { NetworkState } from '../../domain'
import type { RequirementChecker, RequirementResult } from '../../design'
import { LiveCheckScheduler } from './model/LiveCheckScheduler'

export interface LiveCheck {
  /** Results of the latest check (every requirement, hidden ones included); null before the first. */
  results: RequirementResult[] | null
  /** The lab changed since the latest check; a new one is waiting for the quiet time. */
  checking: boolean
}

interface Checked {
  checker: RequirementChecker
  state: NetworkState
  results: RequirementResult[]
}

type Scheduler = LiveCheckScheduler<NetworkState, RequirementResult[]>

/**
 * Live requirement check of the design: `checker.check` runs once the lab has been quiet for the
 * debounce time (LiveCheckScheduler), never on every keystroke or drag frame.
 */
export function useLiveRequirementCheck(checker: RequirementChecker, state: NetworkState): LiveCheck {
  const [checked, setChecked] = useState<Checked | null>(null)
  const schedulerRef = useRef<Scheduler | null>(null)

  // One scheduler per checker (= per brief); declared first so it exists when the state is scheduled.
  useEffect(() => {
    const scheduler: Scheduler = new LiveCheckScheduler(
      (input) => checker.check(input),
      (results, input) => setChecked({ checker, state: input, results }),
    )
    schedulerRef.current = scheduler
    return () => {
      scheduler.dispose()
      if (schedulerRef.current === scheduler) schedulerRef.current = null
    }
  }, [checker])

  useEffect(() => {
    schedulerRef.current?.schedule(state)
  }, [checker, state])

  const current = checked?.checker === checker ? checked : null
  return { results: current?.results ?? null, checking: current?.state !== state }
}
