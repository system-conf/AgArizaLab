// O3 oracle (docs/SIMULATION.md §10.2): on random valid labs, the packet simulator (fresh, settled engine)
// must give the rule engine's answers for ping / reach, tracert, nslookup / resolve, ipconfig /renew, AppLinks
// and the terminal text of ping / tracert / nslookup / ipconfig, except the accepted divergences (§10.3,
// Additions), which are skipped and counted.
// A disagreement fails the test; every kind of disagreement is shrunk to a minimal lab printed as JSON.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { type Mismatch, OracleTally } from './OracleChecks'
import { CHECK_KINDS, type CheckKind, OracleRunner } from './OracleRunner'
import { ORACLE_SETTINGS, randomLabArbitrary, type RandomLab } from './randomLabs'

interface Example {
  mismatch: Mismatch
  lab: RandomLab
  count: number
}

function kindOf(mismatch: Mismatch): CheckKind {
  if (mismatch.property === 'pingPath' || mismatch.property === 'pingReason') return 'ping'
  return mismatch.property === 'appLinkReason' ? 'appLink' : mismatch.property
}

/** One pass over the sampled labs: every disagreement grouped by signature, smallest lab kept. */
function survey(labs: readonly RandomLab[], tally: OracleTally): Map<string, Example> {
  const examples = new Map<string, Example>()
  for (const lab of labs) {
    for (const mismatch of OracleRunner.check(lab.state, tally)) {
      const signature = OracleRunner.signature(mismatch)
      const known = examples.get(signature)
      const smaller = !known || lab.state.devices.length < known.lab.state.devices.length
      examples.set(signature, { mismatch: smaller ? mismatch : (known?.mismatch ?? mismatch), lab: smaller ? lab : (known?.lab ?? lab), count: (known?.count ?? 0) + 1 })
    }
  }
  return examples
}

/** fast-check's shrinking for one kind of comparison: the minimal failing lab and its mismatches. */
function shrink(kind: CheckKind): string {
  const details = fc.check(
    fc.property(randomLabArbitrary, (lab) => OracleRunner.check(lab.state, new OracleTally(), [kind]).length === 0),
    { seed: ORACLE_SETTINGS.seed, numRuns: ORACLE_SETTINGS.numRuns, interruptAfterTimeLimit: 30_000 },
  )
  const lab = details.counterexample?.[0]
  if (!lab) return `${kind}: no counterexample found by fast-check (seed ${ORACLE_SETTINGS.seed})`
  const mismatches = OracleRunner.check(lab.state, new OracleTally(), [kind])
  return [
    `=== minimal lab for '${kind}' (seed ${ORACLE_SETTINGS.seed}, ${details.numShrinks} shrinks) ===`,
    `plan: ${JSON.stringify(lab.plan)}`,
    `lab: ${JSON.stringify(lab.state)}`,
    ...mismatches.map((mismatch) => `mismatch: ${JSON.stringify(mismatch)}`),
  ].join('\n')
}

describe('simulator vs rule engine on random labs (SIMULATION.md §10.2)', () => {
  it('agrees on ping, tracert, resolve, renew, AppLinks and terminal text', () => {
    const labs = fc.sample(randomLabArbitrary, ORACLE_SETTINGS)
    const tally = new OracleTally()
    const examples = survey(labs, tally)
    console.info(`oracle: ${labs.length} labs, seed ${ORACLE_SETTINGS.seed}; compared ${JSON.stringify(tally.compared)}; skipped ${JSON.stringify(tally.skipped)}`)
    // The run must have compared something of every kind, or the generator lost coverage.
    for (const kind of CHECK_KINDS) expect(tally.compared[kind] ?? 0, kind).toBeGreaterThan(0)

    const signatures = [...examples.entries()].map(([signature, example]) => `${signature} (×${example.count})`)
    if (signatures.length > 0) {
      for (const [signature, example] of examples) {
        const { mismatch, lab } = example
        console.error(`--- ${signature}\nexample: ${JSON.stringify(mismatch)}\nplan: ${JSON.stringify(lab.plan)}\nlab (${lab.state.devices.length} devices): ${JSON.stringify(lab.state)}`)
      }
      const failingKinds = [...new Set([...examples.values()].map((example) => kindOf(example.mismatch)))]
      for (const kind of failingKinds) console.error(shrink(kind))
    }
    expect(signatures).toEqual([])
  })
})
