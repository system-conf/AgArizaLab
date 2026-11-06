import { describe, expect, it } from 'vitest'
import { BudgetMeter } from './BudgetMeter'

describe('BudgetMeter', () => {
  it('shows no meter without a budget', () => {
    expect(BudgetMeter.of(500, undefined)).toBeNull()
  })

  it('is green well within the budget', () => {
    expect(BudgetMeter.of(400, 1000)).toEqual({ cost: 400, budget: 1000, remaining: 600, overBy: 0, percent: 40, tone: 'ok' })
  })

  it('turns amber close to the limit and stays amber at exactly the budget', () => {
    expect(BudgetMeter.of(850, 1000)?.tone).toBe('near')
    expect(BudgetMeter.of(1000, 1000)).toMatchObject({ tone: 'near', remaining: 0, percent: 100 })
  })

  it('turns red over the budget and caps the bar', () => {
    expect(BudgetMeter.of(1250, 1000)).toEqual({ cost: 1250, budget: 1000, remaining: 0, overBy: 250, percent: 100, tone: 'over' })
  })

  it('handles a zero budget', () => {
    expect(BudgetMeter.of(0, 0)).toMatchObject({ tone: 'ok', percent: 0 })
    expect(BudgetMeter.of(5, 0)).toMatchObject({ tone: 'over', percent: 100, overBy: 5 })
  })
})
