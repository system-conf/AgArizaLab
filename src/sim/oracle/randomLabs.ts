// Test-only (O3): the random-lab arbitrary (plan → built lab → faults) and the run settings.
import fc from 'fast-check'
import type { NetworkState } from '../../domain'
import { LabBuilder } from './LabBuilder'
import { LabFaults } from './LabFaults'
import { labPlanArbitrary, type LabPlan } from './labPlan'

export interface RandomLab {
  plan: LabPlan
  state: NetworkState
}

/** Shrinks through the plan, so a failing lab shrinks to fewer routers, hosts and faults. */
export const randomLabArbitrary: fc.Arbitrary<RandomLab> = labPlanArbitrary.map((plan) => ({
  plan,
  state: LabFaults.apply(LabBuilder.build(plan), plan.faults),
}))

/** A positive integer from the Vite / Vitest environment (`VITE_ORACLE_RUNS=200 npm test`), else the fallback. */
function envNumber(value: unknown, fallback: number): number {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : fallback
}

/**
 * Fixed seed, configurable size: `VITE_ORACLE_RUNS=200 npm test` locally (the default keeps `npm test`
 * fast), `VITE_ORACLE_SEED=<n>` to explore other labs.
 */
export const ORACLE_SETTINGS = {
  seed: envNumber(import.meta.env.VITE_ORACLE_SEED, 20261106),
  numRuns: envNumber(import.meta.env.VITE_ORACLE_RUNS, 100),
}
