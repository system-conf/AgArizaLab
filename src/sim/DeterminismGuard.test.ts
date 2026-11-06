import { describe, expect, it } from 'vitest'

// docs/SIMULATION.md §3.3: the simulator never reads the wall clock and never uses unseeded randomness.
// The UI (src/features/simulation) maps wall time to virtual time outside the simulator.
const sources = import.meta.glob<string>(['./**/*.ts', '!./**/*.test.ts'], { query: '?raw', import: 'default', eager: true })

const FORBIDDEN: readonly RegExp[] = [
  /\bDate\.now\s*\(/,
  /\bnew Date\s*\(/,
  /\bMath\.random\s*\(/,
  /\bperformance\.now\s*\(/,
  /\bsetTimeout\s*\(/,
  /\bsetInterval\s*\(/,
  /\brequestAnimationFrame\s*\(/,
  /\bcrypto\.getRandomValues\s*\(/,
]

describe('simulator determinism', () => {
  it('finds the simulator sources', () => {
    expect(Object.keys(sources)).toContain('./core/SimulationKernel.ts')
  })

  it('uses no wall clock and no unseeded randomness', () => {
    const offenders = Object.entries(sources).flatMap(([path, text]) =>
      FORBIDDEN.filter((pattern) => pattern.test(text)).map((pattern) => `${path}: ${pattern.source}`),
    )
    expect(offenders).toEqual([])
  })
})
