import type { NetworkEngine } from '../domain/EngineContract'
import type { NetworkState } from '../domain/NetworkTypes'
import type { SolveCondition } from '../domain/ScenarioTypes'
import { ConditionEvaluator } from './ConditionEvaluator'
import { DeviceLookup } from './DeviceLookup'

export interface ConditionResult {
  condition: SolveCondition
  ok: boolean
}

/** Evaluates a scenario's solvedWhen list against a v1 network state (PLAN §4.7). */
export class SolveChecker {
  private readonly evaluator: ConditionEvaluator<NetworkState>

  constructor(engine: NetworkEngine) {
    this.evaluator = new ConditionEvaluator(engine, (state, deviceId) => DeviceLookup.addressesOf(DeviceLookup.require(state, deviceId))[0])
  }

  check(state: NetworkState, conditions: SolveCondition[]): ConditionResult[] {
    return conditions.map((condition) => ({ condition, ok: this.evaluator.holds(state, condition) }))
  }
}
