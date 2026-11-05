import type { NetworkEngine } from '../domain/EngineContract'
import type { NetworkState } from '../domain/NetworkTypes'
import type { SolveCondition } from '../domain/ScenarioTypes'
import { DeviceLookup } from './DeviceLookup'

export interface ConditionResult {
  condition: SolveCondition
  ok: boolean
}

/** Address used by the 'internet' condition. */
const INTERNET_PROBE_IP = '8.8.8.8'

/** Evaluates a scenario's solvedWhen list against a network state (PLAN §4.7). */
export class SolveChecker {
  private readonly engine: NetworkEngine

  constructor(engine: NetworkEngine) {
    this.engine = engine
  }

  check(state: NetworkState, conditions: SolveCondition[]): ConditionResult[] {
    return conditions.map((condition) => ({ condition, ok: this.holds(state, condition) }))
  }

  private holds(state: NetworkState, condition: SolveCondition): boolean {
    switch (condition.type) {
      case 'internet':
        return this.engine.reach(state, condition.fromDeviceId, INTERNET_PROBE_IP).ok
      case 'resolves':
        return this.engine.resolve(state, condition.fromDeviceId, condition.name).ok
      case 'reachable': {
        const target = DeviceLookup.require(state, condition.toDeviceId)
        const targetIp = DeviceLookup.addressesOf(target)[0]
        return targetIp !== undefined && this.engine.reach(state, condition.fromDeviceId, targetIp).ok
      }
      case 'appLinksOk':
        return this.engine.appLinkStatus(state, condition.deviceId).every((status) => status.ok)
    }
  }
}
