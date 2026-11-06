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

/**
 * docs/SIMULATION.md §1: the simulator reads the configuration through src/net and never imports the rule
 * engine's decisions (the oracle O3 compares against). From src/engine only the terminal's parsing and
 * formatting modules are allowed (§10.1); type-only imports are erased and allowed. Test helpers and the
 * oracle (src/sim/oracle) compare with the engine on purpose and are skipped.
 */
const ENGINE_MODULES_ALLOWED: ReadonlySet<string> = new Set([
  'ArpFormatter',
  'CommandFormatter',
  'CommandOptions',
  'HostAdapters',
  'PingFormatter',
  'PingOptions',
  'ReplyTimings',
  'TracertCommand',
  'TracertFormatter',
  'terminalLines',
])
const IMPORT = /^import (type )?[\s\S]*? from '([^']+)'/gm
const ENGINE_PATH = /(?:^|\/)engine(?:\/(\w+))?$/
const TEST_HELPER = /test|golden|\/oracle\//i

function engineImports(path: string, text: string): string[] {
  if (TEST_HELPER.test(path)) return []
  const offenders: string[] = []
  for (const match of text.matchAll(IMPORT)) {
    const [, typeOnly, from] = match
    const engine = from?.match(ENGINE_PATH)
    if (!engine || typeOnly) continue
    const module = engine[1] ?? 'index'
    if (!ENGINE_MODULES_ALLOWED.has(module)) offenders.push(`${path}: ${from}`)
  }
  return offenders
}

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

describe('simulator independence from the rule engine', () => {
  it('imports configuration readers from src/net and no engine decision class', () => {
    expect(Object.entries(sources).flatMap(([path, text]) => engineImports(path, text))).toEqual([])
  })

  it('would catch a decision class import', () => {
    expect(engineImports('./l3/Example.ts', "import { RoutingTable } from '../../engine/RoutingTable'\n")).toHaveLength(1)
    expect(engineImports('./l3/Example.ts', "import {\n  Ipv4,\n  networkEngine,\n} from '../../engine'\n")).toHaveLength(1)
    expect(engineImports('./l3/Example.ts', "import type { ConditionResult } from '../../engine/SolveChecker'\n")).toEqual([])
  })
})
