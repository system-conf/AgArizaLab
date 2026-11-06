import type { NetworkEngine, NetworkState, SolveCondition } from '../domain'
import { DeviceAddresses } from './DeviceAddresses'
import { Topology } from './Topology'

export interface ConditionResult {
  condition: SolveCondition
  ok: boolean
}

/** Address used by the 'internet' condition. */
const INTERNET_PROBE_IP = '8.8.8.8'

/** Evaluates an exercise's solvedWhen list against a network state (PLAN §4.7). */
export class SolveChecker {
  private readonly engine: NetworkEngine

  constructor(engine: NetworkEngine) {
    this.engine = engine
  }

  check(state: NetworkState, conditions: readonly SolveCondition[]): ConditionResult[] {
    return conditions.map((condition) => ({ condition, ok: this.holds(state, condition) }))
  }

  private holds(state: NetworkState, condition: SolveCondition): boolean {
    switch (condition.type) {
      case 'internet':
        return this.engine.reach(state, condition.fromDeviceId, INTERNET_PROBE_IP).ok
      case 'resolves':
        return this.engine.resolve(state, condition.fromDeviceId, condition.name).ok
      case 'reachable': {
        // 'reachable' means the target's current (first) address.
        const targetIp = DeviceAddresses.of(Topology.of(state).require(condition.toDeviceId))[0]
        return targetIp !== undefined && this.engine.reach(state, condition.fromDeviceId, targetIp).ok
      }
      case 'appLinksOk':
        return this.engine.appLinkStatus(state, condition.deviceId).every((status) => status.ok)
    }
  }
}
