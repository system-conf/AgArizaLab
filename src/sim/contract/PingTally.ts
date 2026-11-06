import type { EchoResult, PingResult, PingStats } from './Requests'
import { SIM_LIMITS } from './SimConstants'

const EMPTY: PingStats = { results: 0, replies: 0, errors: 0, timeouts: 0, localFailures: 0, minRttMs: null, maxRttMs: null, totalRttMs: 0 }

/**
 * Bounded ping results (docs/SIMULATION.md §5.2): the latest SIM_LIMITS.echoResultsKept echo results
 * plus counters over all of them, so a ping that runs for a very long time (`count` 1e9) keeps a record
 * of fixed size and correct statistics.
 */
export class PingTally {
  static readonly empty: PingStats = EMPTY

  /** `stats` after one more echo result. */
  static add(stats: PingStats, echo: EchoResult): PingStats {
    const results = stats.results + 1
    switch (echo.kind) {
      case 'reply':
        return {
          ...stats,
          results,
          replies: stats.replies + 1,
          minRttMs: stats.minRttMs === null ? echo.rttMs : Math.min(stats.minRttMs, echo.rttMs),
          maxRttMs: stats.maxRttMs === null ? echo.rttMs : Math.max(stats.maxRttMs, echo.rttMs),
          totalRttMs: stats.totalRttMs + echo.rttMs,
        }
      case 'unreachable':
      case 'ttlExpired':
        return { ...stats, results, errors: stats.errors + 1 }
      case 'timeout':
        return { ...stats, results, timeouts: stats.timeouts + 1 }
      case 'localFailure':
        return { ...stats, results, localFailures: stats.localFailures + 1 }
    }
  }

  /** `previous` (or nothing yet) plus one echo result: the kept window slides, the counters grow. */
  static next(previous: PingResult | null, echo: EchoResult): PingResult {
    const echoes = [...(previous?.echoes ?? []), echo]
    const kept = echoes.length > SIM_LIMITS.echoResultsKept ? echoes.slice(echoes.length - SIM_LIMITS.echoResultsKept) : echoes
    return { kind: 'ping', echoes: kept, stats: PingTally.add(previous?.stats ?? EMPTY, echo) }
  }

  /** The result of a ping that ended with exactly these echoes (at most echoResultsKept of them). */
  static of(echoes: readonly EchoResult[]): PingResult {
    let result: PingResult = { kind: 'ping', echoes: [], stats: EMPTY }
    for (const echo of echoes) result = PingTally.next(result, echo)
    return result
  }
}
