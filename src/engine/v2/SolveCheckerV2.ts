import type { NetworkEngineV2, NetworkStateV2, SolveConditionV2 } from '../../domain/v2'
import { ConditionEvaluator } from '../ConditionEvaluator'
import { DeviceAddressesV2 } from './DeviceAddressesV2'
import { TopologyV2 } from './TopologyV2'

export interface ConditionResultV2 {
  condition: SolveConditionV2
  ok: boolean
}

/** Evaluates an exercise's solvedWhen list against a v2 network state (PLAN §4.7). */
export class SolveCheckerV2 {
  private readonly evaluator: ConditionEvaluator<NetworkStateV2>

  constructor(engine: NetworkEngineV2) {
    this.evaluator = new ConditionEvaluator(engine, (state, deviceId) => DeviceAddressesV2.of(TopologyV2.of(state).require(deviceId))[0])
  }

  check(state: NetworkStateV2, conditions: readonly SolveConditionV2[]): ConditionResultV2[] {
    return conditions.map((condition) => ({ condition, ok: this.evaluator.holds(state, condition) }))
  }
}
