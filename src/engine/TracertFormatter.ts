import type { TerminalLine } from '../domain/EngineContract'
import { textLines } from './terminalLines'

/** One layer-3 device that answered (router hop or the destination itself). */
export interface TracertHop {
  ip: string
  /** 0 prints as "<1 ms", like Windows on a LAN. */
  baseTimeMs: number
}

/** What happened after the last answering hop. */
export type TracertEnding =
  /** The last hop is the destination. */
  | { kind: 'complete' }
  /** "n  X  reports: Destination host unreachable." (own IP for ARP failures, gateway for routing). */
  | { kind: 'unreachable'; reporterIp: string }
  /** Nobody answers any more: "*  *  *  Request timed out." lines. */
  | { kind: 'timedOut' }
  /** No usable adapter, address or gateway: the probe never leaves the host. */
  | { kind: 'generalFailure' }

const MAX_HOPS = 30
/**
 * Windows keeps probing until hop 30. The lab prints at most this many timeout lines after the
 * last answering hop and then ends with "Trace complete." to keep the terminal readable.
 */
const MAX_TIMEOUT_LINES = 4
/** Fixed per-probe jitter for the three probes of a hop (deterministic engine). */
const PROBE_JITTER_MS: readonly number[] = [0, 1, 0]
const TIMEOUT_PROBE = `${'*'.padStart(6)}   `

/** Windows-style (English) tracert output. Pure string building, no network logic. */
export class TracertFormatter {
  tracert(targetIp: string, resolvedName: string | null, hops: readonly TracertHop[], ending: TracertEnding): TerminalLine[] {
    const lines: string[] = ['', ...this.header(targetIp, resolvedName), '']
    hops.forEach((hop, index) => lines.push(this.hopLine(index + 1, hop)))
    lines.push(...this.endingLines(hops.length + 1, ending), '', 'Trace complete.')
    return textLines(lines)
  }

  hostNotFound(name: string): TerminalLine[] {
    return textLines([`Unable to resolve target system name ${name}.`])
  }

  private header(targetIp: string, resolvedName: string | null): string[] {
    if (resolvedName === null) return [`Tracing route to ${targetIp} over a maximum of ${MAX_HOPS} hops`]
    return [`Tracing route to ${resolvedName} [${targetIp}]`, `over a maximum of ${MAX_HOPS} hops:`]
  }

  private endingLines(nextHop: number, ending: TracertEnding): string[] {
    switch (ending.kind) {
      case 'complete':
        return []
      case 'unreachable':
        return [`${this.hopNumber(nextHop)}  ${ending.reporterIp}  reports: Destination host unreachable.`]
      case 'generalFailure':
        return [`${this.hopNumber(nextHop)}  General failure.`]
      case 'timedOut': {
        const lastHop = Math.min(MAX_HOPS, nextHop + MAX_TIMEOUT_LINES - 1)
        const lines: string[] = []
        for (let hop = nextHop; hop <= lastHop; hop += 1) {
          lines.push(`${this.hopNumber(hop)}${TIMEOUT_PROBE.repeat(3)}  Request timed out.`)
        }
        return lines
      }
    }
  }

  /** "  1    <1 ms    <1 ms    <1 ms  192.168.1.1" */
  private hopLine(hopNumber: number, hop: TracertHop): string {
    const probes = PROBE_JITTER_MS.map((jitter) => {
      const time = hop.baseTimeMs === 0 ? '<1' : String(hop.baseTimeMs + jitter)
      return `${time.padStart(6)} ms`
    })
    return `${this.hopNumber(hopNumber)}${probes.join('')}  ${hop.ip}`
  }

  private hopNumber(hop: number): string {
    return String(hop).padStart(3)
  }
}
