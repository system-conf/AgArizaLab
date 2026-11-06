import { describe, expect, it } from 'vitest'
import { officeBrief } from '../../../design/testBriefs'
import type { DesignExercise, DesignExerciseDefinition } from '../../../domain'
import { designDifficultyOf } from '../model/designDifficulty'
import { designListItems } from './designListItem'

function withoutBudget(definition: DesignExerciseDefinition): DesignExerciseDefinition {
  const copy = { ...definition }
  delete copy.budget
  return copy
}

function brief(id: string, budget?: number): DesignExercise {
  const definition = withoutBudget(officeBrief())
  return {
    ...definition,
    ...(budget === undefined ? {} : { budget }),
    id,
    texts: { title: `Title ${id}`, customer: { from: '', message: '' }, reference: { explanation: '', presentation: '', interviewAnswer: '' }, topics: ['DHCP'] },
  }
}

describe('designListItems', () => {
  it('derives the state of each brief from the saved progress', () => {
    const items = designListItems([brief('a', 1000), brief('b'), brief('c')], { a: { solved: true }, b: { solved: false } })
    expect(items.map((item) => item.state)).toEqual(['solved', 'submitted', 'new'])
    expect(items[0]).toMatchObject({ id: 'a', title: 'Title a', budget: 1000, setting: 'office', topics: ['DHCP'] })
    expect(items[1]?.budget).toBeUndefined()
  })
})

describe('designDifficultyOf', () => {
  it('grows with requirements, redundancy and a budget', () => {
    expect(designDifficultyOf({ requirements: [{ id: 'a', condition: { type: 'internet', group: 'g' } }] })).toBe('easy')
    // officeBrief: 11 requirements + 2 for one survivesFailure + 1 for the budget = 14
    expect(designDifficultyOf(officeBrief())).toBe('medium')
    const short = withoutBudget(officeBrief())
    // 8 requirements (one survivesFailure), no budget = 10
    expect(designDifficultyOf({ ...short, requirements: short.requirements.slice(0, 8) })).toBe('easy')
    const failure = officeBrief().requirements[7]
    if (!failure) throw new Error('officeBrief needs 8 requirements')
    expect(designDifficultyOf({ requirements: Array.from({ length: 6 }, () => failure) })).toBe('hard')
  })
})
