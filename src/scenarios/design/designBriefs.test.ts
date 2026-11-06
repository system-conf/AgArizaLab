import { describe, expect, it } from 'vitest'
import type { DesignExerciseDefinition, DesignLab } from '../../domain'
import { StateInvariants } from '../../domain'
import { DesignBriefValidator, DesignInventory, RequirementChecker } from '../../design'
import { designExercises } from './index'

const briefs = designExercises.map((brief): [string, DesignExerciseDefinition] => [brief.id, brief])

function isLimit(brief: DesignExerciseDefinition, requirementId: string): boolean {
  const type = brief.requirements.find((requirement) => requirement.id === requirementId)?.condition.type
  return type === 'maxCost' || type === 'maxDevices'
}

function failing(checker: RequirementChecker, lab: DesignLab): string[] {
  return checker
    .check(lab.state)
    .filter((result) => !result.ok)
    .map((result) => result.requirement.id)
}

describe('design briefs', () => {
  it('have unique ids and consecutive order', () => {
    expect(new Set(designExercises.map((brief) => brief.id)).size).toBe(designExercises.length)
    expect(designExercises.map((brief) => brief.order)).toEqual(designExercises.map((_brief, index) => index + 1))
  })

  describe.each(briefs)('%s', (_id, brief) => {
    const checker = new RequirementChecker(brief)

    it('is consistent (DesignBriefValidator)', () => {
      expect(new DesignBriefValidator().issues(brief)).toEqual([])
    })

    it('fails every requirement on the starting lab except the limits', () => {
      const expected = brief.requirements.filter((requirement) => !isLimit(brief, requirement.id)).map((requirement) => requirement.id)
      expect(failing(checker, brief.lab)).toEqual(expected)
    })

    it('passes every requirement with the reference design, within the budget', () => {
      expect(failing(checker, brief.reference)).toEqual([])
      const cost = new DesignInventory(brief.lab.state).totalCost(brief.reference.state)
      expect(cost).toBeLessThanOrEqual(brief.budget ?? Infinity)
    })

    it('has consistent network states', () => {
      const invariants = new StateInvariants()
      expect(invariants.violations(brief.lab.state)).toEqual([])
      expect(invariants.violations(brief.reference.state)).toEqual([])
    })

    it('keeps the customer devices unchanged in identity in the reference', () => {
      for (const device of brief.lab.state.devices) {
        const twin = brief.reference.state.devices.find((candidate) => candidate.id === device.id)
        expect(twin?.modelId, device.id).toBe(device.modelId)
        expect(twin?.baseMac, device.id).toBe(device.baseMac)
      }
      for (const link of brief.lab.state.links) expect(brief.reference.state.links.some((candidate) => candidate.id === link.id), link.id).toBe(true)
    })

    it('places every device on the canvas and shows every requirement or grades it hidden', () => {
      for (const lab of [brief.lab, brief.reference]) {
        expect(Object.keys(lab.layout.devices).sort()).toEqual(lab.state.devices.map((device) => device.id).sort())
      }
      expect(brief.requirements.some((requirement) => requirement.hidden === true)).toBe(true)
      expect(brief.locks.some((lock) => lock.scope === 'topology')).toBe(false)
    })
  })
})
