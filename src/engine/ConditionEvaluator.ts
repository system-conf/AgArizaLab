import type { SolveConditionV2 } from '../domain/v2'

/** The engine questions solve conditions ask (v1 and v2 engines both answer them). */
export interface ConditionEngine<State> {
  reach(state: State, fromDeviceId: string, toIp: string): { ok: boolean }
  resolve(state: State, fromDeviceId: string, name: string): { ok: boolean }
  appLinkStatus(state: State, deviceId: string): ReadonlyArray<{ ok: boolean }>
}

/** Address used by the 'internet' condition. */
const INTERNET_PROBE_IP = '8.8.8.8'

/**
 * Decides one solve condition (PLAN §4.7) for any state model. v1 conditions have the same shape as
 * SolveConditionV2. `firstAddress` gives a device's current address for 'reachable'.
 */
export class ConditionEvaluator<State> {
  private readonly engine: ConditionEngine<State>
  private readonly firstAddress: (state: State, deviceId: string) => string | undefined

  constructor(engine: ConditionEngine<State>, firstAddress: (state: State, deviceId: string) => string | undefined) {
    this.engine = engine
    this.firstAddress = firstAddress
  }

  holds(state: State, condition: SolveConditionV2): boolean {
    switch (condition.type) {
      case 'internet':
        return this.engine.reach(state, condition.fromDeviceId, INTERNET_PROBE_IP).ok
      case 'resolves':
        return this.engine.resolve(state, condition.fromDeviceId, condition.name).ok
      case 'reachable': {
        const targetIp = this.firstAddress(state, condition.toDeviceId)
        return targetIp !== undefined && this.engine.reach(state, condition.fromDeviceId, targetIp).ok
      }
      case 'appLinksOk':
        return this.engine.appLinkStatus(state, condition.deviceId).every((status) => status.ok)
    }
  }
}
