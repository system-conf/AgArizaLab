import type { DesignCondition, DesignExerciseDefinition, DeviceModel, NetworkCondition } from '../domain'
import { findDeviceModel } from '../catalog'
import { Cidr } from './Cidr'
import { conditionGroups } from './NetworkConditionEvaluator'

export type BriefIssueCode =
  | 'duplicateGroup'
  | 'duplicateRequirement'
  | 'emptyGroup'
  | 'unknownMember'
  | 'unknownGroup'
  | 'unknownFailureTarget'
  | 'invalidPrefix'
  | 'invalidLimit'
  | 'budgetWithoutMaxCost'
  | 'unknownHintRequirement'
  | 'referenceMissingDevice'
  | 'topologyLocked'
  /** A customer device of the starting lab has no `placement` lock (the learner could delete it). */
  | 'unpinnedDevice'
  | 'unknownModel'

export interface BriefIssue {
  code: BriefIssueCode
  /** Id of the offending group, requirement, device, model or hint. */
  subject: string
}

/**
 * Consistency of a design brief's data (for D3 content tests): groups and requirements refer to
 * the starting lab, ids are unique, the reference keeps every customer device, a budget is graded.
 * Behaviour (start fails, reference passes) is checked with RequirementChecker.
 */
export class DesignBriefValidator {
  private readonly findModel: (modelId: string) => DeviceModel | undefined

  constructor(findModel: (modelId: string) => DeviceModel | undefined = findDeviceModel) {
    this.findModel = findModel
  }

  issues(brief: DesignExerciseDefinition): BriefIssue[] {
    const issues: BriefIssue[] = []
    const deviceIds = new Set(brief.lab.state.devices.map((device) => device.id))
    const groupIds = new Set<string>()
    for (const group of brief.groups) {
      if (groupIds.has(group.id)) issues.push({ code: 'duplicateGroup', subject: group.id })
      groupIds.add(group.id)
      if (group.deviceIds.length === 0) issues.push({ code: 'emptyGroup', subject: group.id })
      for (const deviceId of group.deviceIds) if (!deviceIds.has(deviceId)) issues.push({ code: 'unknownMember', subject: deviceId })
    }
    const requirementIds = new Set<string>()
    for (const requirement of brief.requirements) {
      if (requirementIds.has(requirement.id)) issues.push({ code: 'duplicateRequirement', subject: requirement.id })
      requirementIds.add(requirement.id)
      issues.push(...this.conditionIssues(brief, requirement.id, requirement.condition, groupIds))
    }
    const graded = brief.requirements.some((requirement) => requirement.condition.type === 'maxCost' && requirement.condition.amount === brief.budget)
    if (brief.budget !== undefined && !graded) issues.push({ code: 'budgetWithoutMaxCost', subject: brief.id })
    for (const hint of brief.reviewHints) {
      if (hint.requirementId !== undefined && !requirementIds.has(hint.requirementId)) issues.push({ code: 'unknownHintRequirement', subject: hint.id })
    }
    const referenceIds = new Set(brief.reference.state.devices.map((device) => device.id))
    for (const deviceId of deviceIds) if (!referenceIds.has(deviceId)) issues.push({ code: 'referenceMissingDevice', subject: deviceId })
    if (brief.locks.some((lock) => lock.scope === 'topology')) issues.push({ code: 'topologyLocked', subject: brief.id })
    const pinned = new Set(brief.locks.flatMap((lock) => (lock.scope === 'placement' ? [lock.deviceId] : [])))
    for (const deviceId of deviceIds) if (!pinned.has(deviceId)) issues.push({ code: 'unpinnedDevice', subject: deviceId })
    for (const device of [...brief.lab.state.devices, ...brief.reference.state.devices]) {
      if (!this.findModel(device.modelId)) issues.push({ code: 'unknownModel', subject: device.modelId })
    }
    for (const modelId of brief.allowedModels?.modelIds ?? []) if (!this.findModel(modelId)) issues.push({ code: 'unknownModel', subject: modelId })
    return issues
  }

  private conditionIssues(brief: DesignExerciseDefinition, requirementId: string, condition: DesignCondition, groupIds: ReadonlySet<string>): BriefIssue[] {
    switch (condition.type) {
      case 'survivesFailure': {
        const issues = this.networkIssues(requirementId, condition.requirement, groupIds)
        const target = condition.failure
        const known =
          (target.scope === 'device' && brief.lab.state.devices.some((device) => device.id === target.deviceId)) ||
          (target.scope === 'link' && brief.lab.state.links.some((link) => link.id === target.linkId)) ||
          target.scope === 'anyDevice' ||
          target.scope === 'anyLink'
        return known ? issues : [...issues, { code: 'unknownFailureTarget', subject: requirementId }]
      }
      case 'maxCost':
        return condition.amount >= 0 ? [] : [{ code: 'invalidLimit', subject: requirementId }]
      case 'maxDevices':
        return Number.isInteger(condition.count) && condition.count >= 0 ? [] : [{ code: 'invalidLimit', subject: requirementId }]
      case 'uses':
        return []
      default:
        return this.networkIssues(requirementId, condition, groupIds)
    }
  }

  private networkIssues(requirementId: string, condition: NetworkCondition, groupIds: ReadonlySet<string>): BriefIssue[] {
    const issues: BriefIssue[] = conditionGroups(condition)
      .filter((groupId) => !groupIds.has(groupId))
      .map(() => ({ code: 'unknownGroup', subject: requirementId }))
    if (condition.type === 'addressPlan' && Cidr.parse(condition.prefix) === null) issues.push({ code: 'invalidPrefix', subject: requirementId })
    return issues
  }
}
