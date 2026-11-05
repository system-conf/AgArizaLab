import type { CommandResult, ReachResult, TerminalLine } from '../domain/EngineContract'
import type { Device, NetworkState } from '../domain/NetworkTypes'
import type { CommandFormatter } from './CommandFormatter'
import type { DnsResolver } from './DnsResolver'
import { type PingOutcome, PingFormatter } from './PingFormatter'
import { PingOptions, type PingSettings } from './PingOptions'
import { ProbeFailures } from './ProbeFailures'
import type { ReachabilityChecker } from './ReachabilityChecker'
import { ReplyTimings } from './ReplyTimings'

/** `ping [-n count] [-l size] [-t] [-4] <ip|name>` (PLAN §4.6). */
export class PingCommand {
  private readonly reachability: ReachabilityChecker
  private readonly dns: DnsResolver
  private readonly formatter: CommandFormatter
  private readonly pingFormatter = new PingFormatter()

  constructor(reachability: ReachabilityChecker, dns: DnsResolver, formatter: CommandFormatter) {
    this.reachability = reachability
    this.dns = dns
    this.formatter = formatter
  }

  /** Usage errors send no packet (no trace); an unknown name fails at the source. */
  run(state: NetworkState, device: Device, args: readonly string[]): CommandResult {
    const parsed = PingOptions.parse(args)
    if (!parsed.ok) return { lines: this.formatter.optionError(parsed.error, 'ping') }
    const { settings } = parsed
    const note = this.notes(settings)

    const target = this.dns.resolveTarget(state, device.id, settings.target)
    if (!target.ok) {
      return { lines: [...note, ...this.pingFormatter.hostNotFound(settings.target)], trace: { path: [device.id], ok: false } }
    }
    const { result, reached } = this.reachability.trace(state, device.id, target.ip)
    const outcome = this.outcome(state, device, target.ip, result)
    return {
      lines: [...note, ...this.pingFormatter.ping(target.ip, target.name, outcome, settings)],
      trace: { path: reached, ok: result.ok },
    }
  }

  /** App notes shown before the Windows output when the lab does not do exactly what was asked. */
  private notes(settings: PingSettings): TerminalLine[] {
    if (settings.continuous) return [this.pingFormatter.continuousNotSupported()]
    if (settings.countLimited) return [this.pingFormatter.countLimited(PingOptions.maxCount)]
    return []
  }

  private outcome(state: NetworkState, device: Device, targetIp: string, reach: ReachResult): PingOutcome {
    if (reach.ok) return { kind: 'reply', fromIp: targetIp, ...ReplyTimings.forPath(state, targetIp, reach.path) }
    const ownIp = device.host?.ip ?? ''
    const failure = ProbeFailures.classify(reach, device.id)
    switch (failure.kind) {
      case 'unreachable':
        return { kind: 'unreachable', fromIp: failure.reporter === 'self' ? ownIp : (device.host?.gateway ?? ownIp) }
      case 'silent':
        return { kind: 'timeout' }
      case 'generalFailure':
        return { kind: 'generalFailure' }
    }
  }
}
