import type { CommandResult, NetworkState } from '../domain'
import type { CommandFormatter } from './CommandFormatter'
import { CommandOptions, type OptionSpec } from './CommandOptions'
import type { Prober } from './ProbeReports'
import { TracertFormatter } from './TracertFormatter'

/** -d (no name lookup: the lab prints addresses anyway) and -4 are accepted and change nothing. */
const SPEC: OptionSpec = { flags: ['d', '4'], valued: [] }

/**
 * `tracert [-d] [-4] <ip|name>`. Hops are the layer-3 devices of the probe:
 * the routers (each answering from the address the probe arrived on), then the destination.
 * Switches and access points are invisible to tracert; the internet adds no fictional ISP hops.
 */
export class TracertCommand {
  private readonly prober: Prober
  private readonly formatter: CommandFormatter
  private readonly tracertFormatter = new TracertFormatter()

  constructor(prober: Prober, formatter: CommandFormatter) {
    this.prober = prober
    this.formatter = formatter
  }

  run(state: NetworkState, deviceId: string, args: readonly string[]): Omit<CommandResult, 'nextState'> {
    const parsed = CommandOptions.parse(args, SPEC)
    if (!parsed.ok) return { lines: this.formatter.optionError(parsed.error, 'tracert') }
    const name = parsed.options.target

    const target = this.prober.resolveTarget(state, deviceId, name)
    if (!target.ok) return { lines: this.tracertFormatter.hostNotFound(name), trace: { path: [deviceId], ok: false } }

    const { route, trace } = this.prober.probe(state, deviceId, target.ip)
    return { lines: this.tracertFormatter.tracert(target.ip, target.name, route.hops, route.ending), trace }
  }
}
