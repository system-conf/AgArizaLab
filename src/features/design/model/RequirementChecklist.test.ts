import { describe, expect, it } from 'vitest'
import { RequirementChecker } from '../../../design'
import { officeBrief, officeReferenceState, officeStartState } from '../../../design/testBriefs'
import type { DesignRequirement } from '../../../domain'
import { RequirementChecklist } from './RequirementChecklist'

const describe_ = (requirement: DesignRequirement) => ({ description: { key: `test:${requirement.id}` } })

describe('RequirementChecklist', () => {
  const brief = officeBrief()
  const checker = new RequirementChecker(brief)
  const visibleIds = brief.requirements.filter((requirement) => requirement.hidden !== true).map((requirement) => requirement.id)

  it('shows every visible requirement grey before the first check, hidden ones as placeholders', () => {
    const view = RequirementChecklist.build(brief.requirements, null, describe_)
    expect(view.items.map((item) => item.id)).toEqual(visibleIds)
    expect(view.items.every((item) => item.status === 'unknown')).toBe(true)
    expect(view.items[0]?.description).toEqual({ key: `test:${visibleIds[0]}` })
    expect(view.hiddenCount).toBe(1)
    expect(view).toMatchObject({ met: 0, total: visibleIds.length, allMet: false })
  })

  it('marks requirements green / red from a check of the start (only limits hold)', () => {
    const view = RequirementChecklist.build(brief.requirements, checker.check(officeStartState()), describe_)
    const met = view.items.filter((item) => item.status === 'met').map((item) => item.id)
    expect(met).toEqual(['budget', 'oneRouter'])
    expect(view.items.find((item) => item.id === 'budget')?.measure).toEqual({ unit: 'cost', value: 0, limit: 1000 })
    expect(view.items.some((item) => item.id === 'printerOnline')).toBe(false)
  })

  it('is all green for the reference design', () => {
    const view = RequirementChecklist.build(brief.requirements, checker.check(officeReferenceState()), describe_)
    expect(view).toMatchObject({ met: visibleIds.length, allMet: true })
    expect(view.items.find((item) => item.id === 'printingOffline')?.qualifier).toBeDefined()
  })
})
