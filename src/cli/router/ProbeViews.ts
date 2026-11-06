// IOS output of `ping` and `traceroute` from a finished simulator request (docs/CLI.md §7).
import type { EchoResult, IcmpUnreachableCode, RequestRecord, TracertHopResult, TracertProbeResult } from '../../sim/contract'

const MARKS_PER_LINE = 70
const PROBE_SEPARATOR = '    '

const UNREACHABLE_MARKS: Readonly<Record<IcmpUnreachableCode, string>> = {
  net: 'N',
  host: 'H',
  protocol: 'P',
  port: 'P',
  adminProhibited: 'A',
}

/** IOS ping marks: ! reply, . timeout, U unreachable, & TTL expired. */
function markOf(echo: EchoResult): string {
  switch (echo.kind) {
    case 'reply':
      return '!'
    case 'unreachable':
      return 'U'
    case 'ttlExpired':
      return '&'
    case 'timeout':
    case 'localFailure':
      return '.'
  }
}

function probeText(probe: TracertProbeResult): string {
  switch (probe.kind) {
    case 'timeout':
      return '*'
    case 'unreachable':
      return `!${UNREACHABLE_MARKS[probe.code]}`
    case 'timeExceeded':
    case 'echoReply':
      return `${Math.round(probe.rttMs)} msec`
  }
}

function hopLine(hop: TracertHopResult): string {
  const answered = hop.probes.find((probe) => probe.kind !== 'timeout')
  const address = answered === undefined ? '' : answered.fromIp.padEnd(16)
  return `${String(hop.ttl).padStart(3)}   ${address}${hop.probes.map(probeText).join(PROBE_SEPARATOR)}`
}

export class ProbeViews {
  /** The marks line(s) and the success rate of a ping of `count` echoes. */
  static ping(record: RequestRecord, count: number): string[] {
    const result = record.result
    if (result?.kind !== 'ping') return [`Success rate is 0 percent (0/${count})`]
    const marks = result.echoes.map(markOf).join('')
    const lines: string[] = []
    for (let start = 0; start < marks.length; start += MARKS_PER_LINE) lines.push(marks.slice(start, start + MARKS_PER_LINE))
    const { stats } = result
    const sent = stats.results === 0 ? count : stats.results
    const percent = Math.floor((stats.replies * 100) / sent)
    const success = `Success rate is ${percent} percent (${stats.replies}/${sent})`
    if (stats.replies === 0 || stats.minRttMs === null || stats.maxRttMs === null) return [...lines, success]
    const average = Math.round(stats.totalRttMs / stats.replies)
    return [...lines, `${success}, round-trip min/avg/max = ${Math.round(stats.minRttMs)}/${average}/${Math.round(stats.maxRttMs)} ms`]
  }

  /** One line per hop. */
  static trace(record: RequestRecord): string[] {
    const result = record.result
    return result?.kind === 'tracert' ? result.hops.map(hopLine) : []
  }
}
