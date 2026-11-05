import type { CommandResult, TerminalLine } from '../domain/EngineContract'
import type { CommandFormatter } from './CommandFormatter'
import { PingFormatter } from './PingFormatter'
import { PingOptions, type PingSettings } from './PingOptions'
import type { Prober } from './ProbeReports'

/** `ping [-n count] [-l size] [-t] [-4] <ip|name>` (PLAN §4.6), for any state model. */
export class PingCommand<State> {
  private readonly prober: Prober<State>
  private readonly formatter: CommandFormatter
  private readonly pingFormatter = new PingFormatter()

  constructor(prober: Prober<State>, formatter: CommandFormatter) {
    this.prober = prober
    this.formatter = formatter
  }

  /** Usage errors send no packet (no trace); an unknown name fails at the source. */
  run(state: State, deviceId: string, args: readonly string[]): Omit<CommandResult, 'nextState'> {
    const parsed = PingOptions.parse(args)
    if (!parsed.ok) return { lines: this.formatter.optionError(parsed.error, 'ping') }
    const { settings } = parsed
    const note = this.notes(settings)

    const target = this.prober.resolveTarget(state, deviceId, settings.target)
    if (!target.ok) {
      return { lines: [...note, ...this.pingFormatter.hostNotFound(settings.target)], trace: { path: [deviceId], ok: false } }
    }
    const report = this.prober.probe(state, deviceId, target.ip)
    return { lines: [...note, ...this.pingFormatter.ping(target.ip, target.name, report.ping, settings)], trace: report.trace }
  }

  /** App notes shown before the Windows output when the lab does not do exactly what was asked. */
  private notes(settings: PingSettings): TerminalLine[] {
    if (settings.continuous) return [this.pingFormatter.continuousNotSupported()]
    if (settings.countLimited) return [this.pingFormatter.countLimited(PingOptions.maxCount)]
    return []
  }
}
