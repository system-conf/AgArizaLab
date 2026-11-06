import type { DeviceGroup, NetworkEngine, NetworkState, SolveCondition } from '../../domain'
import { Cidr, conditionGroups, GroupMembers, NetworkConditionEvaluator } from '../../design'
import { DeviceAddresses, networkEngine, SolveChecker } from '../../engine'
import type { CheckResult, SampleDefinition, SampleStep, StepCheck, StepStatus } from './SampleTypes'

/** The part of a sample the checker needs. */
export type SampleRules = Pick<SampleDefinition, 'steps'> & Partial<Pick<SampleDefinition, 'groups'>>

export interface StepCheckerOptions {
  engine?: NetworkEngine
}

/** Device ids a solve condition needs in the lab (a missing one fails the check instead of throwing). */
export function solveConditionDevices(condition: SolveCondition): string[] {
  switch (condition.type) {
    case 'internet':
    case 'resolves':
      return [condition.fromDeviceId]
    case 'reachable':
      return [condition.fromDeviceId, condition.toDeviceId]
    case 'appLinksOk':
      return [condition.deviceId]
  }
}

/** Every leaf check of a check (unwraps `not`). */
export function leafChecks(check: StepCheck): StepCheck[] {
  return check.type === 'not' ? leafChecks(check.check) : [check]
}

/** Group ids the `network` checks of the steps use, in first-use order. */
export function referencedGroupIds(steps: readonly SampleStep[]): string[] {
  const ids = steps
    .flatMap((step) => step.checks ?? [])
    .flatMap(leafChecks)
    .flatMap((check) => (check.type === 'network' ? conditionGroups(check.condition) : []))
  return [...new Set(ids)]
}

/**
 * Evaluates the "try this" step checks of one sample on a lab state (docs/SAMPLE_LABS.md §Contract).
 * Pure: never mutates the state. Rule engine only: simulation-only observations are manual steps.
 * A check about a device the learner deleted fails; it never throws.
 */
export class StepChecker {
  private readonly steps: readonly SampleStep[]
  private readonly solver: SolveChecker
  private readonly evaluator: NetworkConditionEvaluator

  constructor(rules: SampleRules, options: StepCheckerOptions = {}) {
    const engine = options.engine ?? networkEngine
    this.steps = rules.steps
    this.solver = new SolveChecker(engine)
    this.evaluator = new NetworkConditionEvaluator(engine, new GroupMembers(StepChecker.groupsOf(rules)))
  }

  /** Declared groups plus one single-device group for every other group id a check uses. */
  static groupsOf(rules: SampleRules): DeviceGroup[] {
    const declared = rules.groups ?? []
    const known = new Set(declared.map((group) => group.id))
    const implicit = referencedGroupIds(rules.steps)
      .filter((id) => !known.has(id))
      .map((id): DeviceGroup => ({ id, name: id, deviceIds: [id] }))
    return [...declared, ...implicit]
  }

  /** Status of every step, in step order. */
  check(state: NetworkState): StepStatus[] {
    return this.steps.map((step) => this.checkStep(state, step))
  }

  checkStep(state: NetworkState, step: SampleStep): StepStatus {
    const checks = step.checks ?? []
    if (checks.length === 0) return { stepId: step.id, kind: 'manual' }
    const results: CheckResult[] = checks.map((check) => ({ check, ok: this.holds(state, check) }))
    return { stepId: step.id, kind: 'auto', ok: results.every((result) => result.ok), checks: results }
  }

  holds(state: NetworkState, check: StepCheck): boolean {
    switch (check.type) {
      case 'solve':
        return this.solveHolds(state, check.condition)
      case 'network':
        return this.evaluator.evaluate(state, check.condition).ok
      case 'hasAddress':
        return this.hasAddress(state, check.deviceId, check.prefix)
      case 'not':
        return !this.holds(state, check.check)
    }
  }

  private solveHolds(state: NetworkState, condition: SolveCondition): boolean {
    const present = new Set(state.devices.map((device) => device.id))
    if (!solveConditionDevices(condition).every((id) => present.has(id))) return false
    return this.solver.check(state, [condition]).every((result) => result.ok)
  }

  private hasAddress(state: NetworkState, deviceId: string, prefix: string | undefined): boolean {
    const device = state.devices.find((candidate) => candidate.id === deviceId)
    if (!device) return false
    const addresses = DeviceAddresses.of(device)
    if (prefix === undefined) return addresses.length > 0
    const block = Cidr.parse(prefix)
    return block !== null && addresses.some((address) => Cidr.contains(block, address))
  }
}
