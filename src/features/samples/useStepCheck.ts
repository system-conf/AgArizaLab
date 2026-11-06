import { useEffect, useMemo, useRef, useState } from 'react'
import type { NetworkState } from '../../domain'
import { StepChecker, type SampleDefinition, type StepStatus } from '../../samples'
import { LiveCheckScheduler } from '../design/model/LiveCheckScheduler'

export interface LiveStepCheck {
  /** Status of every step on the latest checked lab; null before the first check. */
  statuses: StepStatus[] | null
  /** The lab changed since the latest check; a new one waits for the quiet time. */
  checking: boolean
}

interface Checked {
  checker: StepChecker
  state: NetworkState
  statuses: StepStatus[]
}

type Scheduler = LiveCheckScheduler<NetworkState, StepStatus[]>

/**
 * Live "try this" step checks of the open sample: StepChecker runs once the lab has been quiet for
 * the debounce time (the design mode's LiveCheckScheduler), never on every keystroke or drag frame.
 */
export function useStepCheck(sample: SampleDefinition, state: NetworkState): LiveStepCheck {
  const checker = useMemo(() => new StepChecker(sample), [sample])
  const [checked, setChecked] = useState<Checked | null>(null)
  const schedulerRef = useRef<Scheduler | null>(null)

  // One scheduler per checker (= per sample); declared first so it exists when the state is scheduled.
  useEffect(() => {
    const scheduler: Scheduler = new LiveCheckScheduler(
      (input) => checker.check(input),
      (statuses, input) => setChecked({ checker, state: input, statuses }),
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
  return { statuses: current?.statuses ?? null, checking: current?.state !== state }
}
