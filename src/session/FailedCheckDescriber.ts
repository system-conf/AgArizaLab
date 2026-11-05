import type { NetworkState } from '../domain/NetworkTypes'
import type { SolveCondition } from '../domain/ScenarioTypes'
import type { ConditionResult } from '../engine'

/**
 * Turns unmet solve conditions into plain Turkish sentences for the player.
 * Sentences state the symptom only, never the cause, so the fault stays hidden.
 */
export class FailedCheckDescriber {
  /** One sentence per failing condition, without duplicates, in condition order. */
  static describeFailures(state: NetworkState, results: readonly ConditionResult[]): string[] {
    const sentences = results
      .filter((result) => !result.ok)
      .map((result) => FailedCheckDescriber.describe(state, result.condition))
    return [...new Set(sentences)]
  }

  static describe(state: NetworkState, condition: SolveCondition): string {
    switch (condition.type) {
      case 'internet':
        return `${FailedCheckDescriber.nameOf(state, condition.fromDeviceId)} hâlâ internete çıkamıyor.`
      case 'resolves':
        return `${FailedCheckDescriber.nameOf(state, condition.fromDeviceId)} hâlâ '${condition.name}' sitesini açamıyor.`
      case 'reachable': {
        const from = FailedCheckDescriber.nameOf(state, condition.fromDeviceId)
        const to = FailedCheckDescriber.nameOf(state, condition.toDeviceId)
        // "cihazına" avoids a vowel-harmony suffix that would depend on the device name.
        return `${from} hâlâ ${to} cihazına ulaşamıyor.`
      }
      case 'appLinksOk':
        return `${FailedCheckDescriber.nameOf(state, condition.deviceId)} bazı cihazlara hâlâ ulaşamıyor.`
    }
  }

  /** Display name of a device; falls back to the id so a sentence is never empty. */
  private static nameOf(state: NetworkState, deviceId: string): string {
    return state.devices.find((device) => device.id === deviceId)?.name ?? deviceId
  }
}
