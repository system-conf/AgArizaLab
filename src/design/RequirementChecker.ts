import type {
  DesignCondition,
  DesignExerciseDefinition,
  DesignRequirement,
  DeviceCapability,
  DeviceModel,
  FailureTarget,
  NetworkCondition,
  NetworkEngine,
  NetworkState,
} from '../domain'
import type { LocalizedMessage } from '../domain/Messages'
import { findDeviceModel } from '../catalog'
import { networkEngine, Topology } from '../engine'
import { DesignInventory } from './DesignInventory'
import { DhcpSettler } from './DhcpSettler'
import { FailureScenarios } from './FailureScenarios'
import { GroupMembers } from './GroupMembers'
import { conditionGroups, NetworkConditionEvaluator, type ConditionOutcome, type RequirementMeasure } from './NetworkConditionEvaluator'
import { PriceCatalog } from './PriceCatalog'
import { RequirementDescriber, type RequirementText } from './RequirementDescriber'

/** The part of a brief the checker needs (works with the definition and the localized brief). */
export type DesignRules = Pick<DesignExerciseDefinition, 'groups' | 'requirements'> & { lab: { state: NetworkState } }

export interface RequirementCheckerOptions {
  engine?: NetworkEngine
  prices?: PriceCatalog
  /** Catalog lookup for `uses` (default: src/catalog `findDeviceModel`). */
  findModel?: (modelId: string) => DeviceModel | undefined
}

export interface RequirementResult {
  requirement: DesignRequirement
  ok: boolean
  /** What the customer wants (never the solution). */
  description: LocalizedMessage
  /** `survivesFailure`: "… even when X is down". */
  qualifier?: LocalizedMessage
  measure?: RequirementMeasure
  /** `survivesFailure` that failed only under a failure: the device / link id that broke it (review). */
  brokenBy?: string
}

/** Outcome of one requirement before texts are attached. */
export interface RequirementOutcome extends ConditionOutcome {
  /** `survivesFailure` only: the device / link id whose failure broke the requirement. */
  brokenBy?: string
}

/** A state prepared once for evaluating many requirements. */
export interface PreparedState {
  /** The lab state as given (limits, inventory). */
  original: NetworkState
  /** Every DHCP client has asked for an address (DhcpSettler). */
  settled: NetworkState
}

/**
 * Evaluates every requirement of a design brief on a lab state (DESIGN_EXERCISES.md §2, §6). Pure:
 * works on copies, never mutates. One instance per brief; `check` is cheap enough for a debounced
 * live checklist (see RequirementChecker.perf.test.ts).
 */
export class RequirementChecker {
  readonly rules: DesignRules
  readonly groups: GroupMembers
  readonly inventory: DesignInventory
  private readonly engine: NetworkEngine
  private readonly settler: DhcpSettler
  private readonly evaluator: NetworkConditionEvaluator
  private readonly failures = new FailureScenarios()
  private readonly findModel: (modelId: string) => DeviceModel | undefined
  private readonly texts: ReadonlyMap<string, RequirementText>

  constructor(rules: DesignRules, options: RequirementCheckerOptions = {}) {
    this.rules = rules
    this.engine = options.engine ?? networkEngine
    this.groups = new GroupMembers(rules.groups)
    this.inventory = new DesignInventory(rules.lab.state, options.prices ?? PriceCatalog.default)
    this.settler = new DhcpSettler(this.engine)
    this.evaluator = new NetworkConditionEvaluator(this.engine, this.groups)
    this.findModel = options.findModel ?? findDeviceModel
    // Texts depend only on the brief (names of the starting lab), so they are built once.
    const describer = new RequirementDescriber(this.groups)
    this.texts = new Map(rules.requirements.map((requirement) => [requirement.id, describer.describe(rules.lab.state, requirement.condition)]))
  }

  /** Every requirement, hidden ones included, in brief order. */
  check(state: NetworkState): RequirementResult[] {
    const prepared = this.prepare(state)
    return this.rules.requirements.map((requirement) => this.result(requirement, this.evaluate(prepared, requirement.condition)))
  }

  /** Settles DHCP once; pass the result to `evaluate` for several conditions. */
  prepare(state: NetworkState): PreparedState {
    return { original: state, settled: this.settler.settle(state) }
  }

  evaluate(prepared: PreparedState, condition: DesignCondition): RequirementOutcome {
    switch (condition.type) {
      case 'survivesFailure':
        return this.survives(prepared.settled, condition.failure, condition.requirement)
      case 'uses':
        return { ok: this.uses(prepared.original, condition.capability) }
      case 'maxCost': {
        const cost = this.inventory.totalCost(prepared.original)
        return { ok: cost <= condition.amount, measure: { unit: 'cost', value: cost, limit: condition.amount } }
      }
      case 'maxDevices': {
        const added = this.inventory.addedDevices(prepared.original)
        const count = condition.kind === undefined ? added.length : added.filter((device) => device.kind === condition.kind).length
        return { ok: count <= condition.count, measure: { unit: 'devices', value: count, limit: condition.count } }
      }
      default:
        return this.evaluator.evaluate(prepared.settled, condition)
    }
  }

  /** A network condition on an already settled state (single points of failure, failure cases). */
  evaluateNetwork(settled: NetworkState, condition: NetworkCondition): ConditionOutcome {
    return this.evaluator.evaluate(settled, condition)
  }

  /** Builds the result of a requirement from an outcome of `evaluate`. */
  result(requirement: DesignRequirement, outcome: RequirementOutcome): RequirementResult {
    const text = this.texts.get(requirement.id)
    if (!text) throw new Error(`Requirement ${requirement.id} is not part of the brief`)
    return {
      requirement,
      ok: outcome.ok,
      description: text.description,
      ...(text.qualifier ? { qualifier: text.qualifier } : {}),
      ...(outcome.measure ? { measure: outcome.measure } : {}),
      ...(outcome.brokenBy === undefined ? {} : { brokenBy: outcome.brokenBy }),
    }
  }

  /**
   * The requirement holds with everything up and in every failure case. Leases stay as they are
   * under a failure (clients keep their addresses), so the failure state is not settled again.
   */
  private survives(settled: NetworkState, failure: FailureTarget, requirement: NetworkCondition): RequirementOutcome {
    const base = this.evaluator.evaluate(settled, requirement)
    if (!base.ok) return base
    const members = this.groups.memberIds(conditionGroups(requirement))
    for (const failureCase of this.failures.cases(settled, failure, members)) {
      if (!this.evaluator.evaluate(failureCase.state, requirement).ok) return { ok: false, brokenBy: failureCase.failedId }
    }
    return { ok: true }
  }

  /** A powered device whose model has the capability, with at least one link up. */
  private uses(state: NetworkState, capability: DeviceCapability): boolean {
    const topology = Topology.of(state)
    return state.devices.some(
      (device) =>
        device.powered &&
        (this.findModel(device.modelId)?.capabilities.includes(capability) ?? false) &&
        topology.linksOf(device.id).some((link) => topology.isUp(link)),
    )
  }
}
