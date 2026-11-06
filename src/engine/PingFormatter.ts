import type { TerminalLine } from '../domain'
import { localizedMessage } from '../i18n/messageKeys'
import { PingOptions, type PingSettings } from './PingOptions'
import { messageLine, textLines } from './terminalLines'

/** How every echo request of a ping ended (all requests behave the same: deterministic engine). */
export type PingOutcome =
  | { kind: 'reply'; fromIp: string; ttl: number; baseTimeMs: number }
  /** "Reply from X: Destination host unreachable." (X = own IP for ARP failures, gateway for routing). */
  | { kind: 'unreachable'; fromIp: string }
  /** "Reply from X: TTL expired in transit." (X = the router where the looping packet's TTL ran out). */
  | { kind: 'ttlExpired'; fromIp: string }
  | { kind: 'timeout' }
  /** No usable adapter/route/address at all: "PING: transmit failed. General failure." */
  | { kind: 'generalFailure' }

/** What was sent: number of echo requests and data bytes per request. */
export interface PingRequest {
  count: number
  size: number
}

/** Fixed per-reply jitter (repeated for longer pings) so times look natural yet tests stay stable. */
const TIME_JITTER_MS: readonly number[] = [0, 1, 0, 2]

/** Windows-style (English) ping output. Pure string building, no network logic. */
export class PingFormatter {
  ping(targetIp: string, resolvedName: string | null, outcome: PingOutcome, request: PingRequest): TerminalLine[] {
    return this.pingEchoes(targetIp, resolvedName, Array.from({ length: request.count }, () => outcome), request.size)
  }

  /**
   * Per-echo output (Windows prints every echo as it happened): one line per outcome, in order. Equal
   * outcomes print exactly like `ping`. Error replies count as received; the round trip times cover the
   * echo replies.
   */
  pingEchoes(targetIp: string, resolvedName: string | null, outcomes: readonly PingOutcome[], size: number): TerminalLine[] {
    const count = outcomes.length
    const header = resolvedName === null ? targetIp : `${resolvedName} [${targetIp}]`
    const lines: string[] = ['', `Pinging ${header} with ${size} bytes of data:`]
    outcomes.forEach((outcome, index) => lines.push(this.echoLine(outcome, index, size)))

    // Windows counts ICMP error replies (unreachable, TTL expired) as received.
    const received = outcomes.filter((outcome) => outcome.kind !== 'timeout' && outcome.kind !== 'generalFailure').length
    const lost = count - received
    lines.push(
      '',
      `Ping statistics for ${targetIp}:`,
      `    Packets: Sent = ${count}, Received = ${received}, Lost = ${lost} (${count === 0 ? 0 : Math.floor((lost / count) * 100)}% loss),`,
    )
    const times = outcomes.flatMap((outcome, index) => (outcome.kind === 'reply' ? [this.time(outcome.baseTimeMs, index)] : []))
    if (times.length > 0) {
      const average = Math.round(times.reduce((sum, time) => sum + time, 0) / times.length)
      lines.push(
        'Approximate round trip times in milli-seconds:',
        `    Minimum = ${Math.min(...times)}ms, Maximum = ${Math.max(...times)}ms, Average = ${average}ms`,
      )
    }
    return textLines(lines)
  }

  /** App notes shown before the Windows output when the lab does not do exactly what was asked (-t, -n above the limit). */
  settingsNotes(settings: PingSettings): TerminalLine[] {
    if (settings.continuous) return [this.continuousNotSupported()]
    if (settings.countLimited) return [this.countLimited(PingOptions.maxCount)]
    return []
  }
  hostNotFound(name: string): TerminalLine[] {
    return textLines([`Ping request could not find host ${name}. Please check the name and try again.`])
  }

  /** App note shown before the output of `ping -t`. */
  continuousNotSupported(): TerminalLine {
    return messageLine(localizedMessage('engine:pingContinuousNotSupported'), 'info')
  }

  /** App note shown before the output of `ping -n N` with N above the lab's limit. */
  countLimited(maxCount: number): TerminalLine {
    return messageLine(localizedMessage('engine:pingCountLimited', { count: maxCount }), 'info')
  }

  private echoLine(outcome: PingOutcome, index: number, size: number): string {
    switch (outcome.kind) {
      case 'reply': {
        return `Reply from ${outcome.fromIp}: bytes=${size} time=${this.time(outcome.baseTimeMs, index)}ms TTL=${outcome.ttl}`
      }
      case 'unreachable':
        return `Reply from ${outcome.fromIp}: Destination host unreachable.`
      case 'ttlExpired':
        return `Reply from ${outcome.fromIp}: TTL expired in transit.`
      case 'timeout':
        return 'Request timed out.'
      case 'generalFailure':
        return 'PING: transmit failed. General failure.'
    }
  }

  private time(baseTimeMs: number, index: number): number {
    return baseTimeMs + (TIME_JITTER_MS[index % TIME_JITTER_MS.length] ?? 0)
  }
}
