import type { DesignRequirement } from '../../../domain'
import type { LocalizedMessage } from '../../../domain/Messages'
import type { RequirementMeasure, RequirementResult } from '../../../design'

/** met = green, unmet = red, unknown = grey (not checked yet). */
export type ChecklistStatus = 'met' | 'unmet' | 'unknown'

export interface ChecklistItem {
  id: string
  status: ChecklistStatus
  description: LocalizedMessage
  qualifier?: LocalizedMessage
  /** "3 / 5" progress of the requirement (only from a check). */
  measure?: RequirementMeasure
}

export interface ChecklistView {
  /** Visible requirements in brief order. */
  items: ChecklistItem[]
  /** Hidden requirements: shown as "acceptance test" placeholders, graded in the review. */
  hiddenCount: number
  met: number
  /** Number of visible requirements. */
  total: number
  /** Every visible requirement is met. */
  allMet: boolean
}

/** Statement of a requirement before any check (from RequirementDescriber). */
export type DescribeRequirement = (requirement: DesignRequirement) => { description: LocalizedMessage; qualifier?: LocalizedMessage }

/** The live checklist of the brief panel built from the latest check (or none yet). */
export class RequirementChecklist {
  static build(
    requirements: readonly DesignRequirement[],
    results: readonly RequirementResult[] | null,
    describe: DescribeRequirement,
  ): ChecklistView {
    const byId = new Map((results ?? []).map((result) => [result.requirement.id, result]))
    const visible = requirements.filter((requirement) => requirement.hidden !== true)
    const items = visible.map((requirement): ChecklistItem => {
      const result = byId.get(requirement.id)
      if (result === undefined) {
        const text = describe(requirement)
        return { id: requirement.id, status: 'unknown', description: text.description, ...(text.qualifier ? { qualifier: text.qualifier } : {}) }
      }
      return {
        id: requirement.id,
        status: result.ok ? 'met' : 'unmet',
        description: result.description,
        ...(result.qualifier ? { qualifier: result.qualifier } : {}),
        ...(result.measure ? { measure: result.measure } : {}),
      }
    })
    const met = items.filter((item) => item.status === 'met').length
    return { items, hiddenCount: requirements.length - visible.length, met, total: items.length, allMet: items.length > 0 && met === items.length }
  }
}
