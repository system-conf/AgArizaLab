import type { TerminalLine } from '../../domain'
import type { CommandFormatter } from '../../engine/CommandFormatter'
import type { PingFormatter, PingOutcome } from '../../engine/PingFormatter'
import { TracertFormatter } from '../../engine/TracertFormatter'
import { type DhcpAdapterResult, type DhcpResult, PduLayers, type PingResult, type RequestRecord, type SimEvent, type SimulationEngine, type TracertResult } from '../contract'
import type { CommandStage, ProbeCommand, SimCommandOutcome } from './CommandStages'
import { PduPaths } from './PduPaths'
import { ProbeOutcomes } from './ProbeOutcomes'
import { SimHostViews } from './SimHostViews'

/** The engine's formatters the terminal prints with (no formatting of its own). */
export interface TerminalFormatters {
  readonly command: CommandFormatter
  readonly ping: PingFormatter
  readonly tracert: TracertFormatter
}

type ProbeStage = Extract<CommandStage, { kind: 'probe' }>

const NO_EFFECTS: SimCommandOutcome['effects'] = []

/** Turns finished requests into terminal output (docs/SIMULATION.md §10.1). */
export class CommandOutcomes {
  private readonly formatters: TerminalFormatters

  constructor(formatters: TerminalFormatters) {
    this.formatters = formatters
  }

  /** The device was switched off (or removed) while the command ran. */
  aborted(): SimCommandOutcome {
    return { lines: this.formatters.command.devicePoweredOff(), effects: NO_EFFECTS }
  }

  /** ping / tracert to a name that did not resolve: Windows' "could not find host", the trace stays at the source. */
  hostNotFound(deviceId: string, name: string, command: ProbeCommand): SimCommandOutcome {
    const trace = { path: [deviceId], ok: false }
    if (command.kind === 'tracert') return { lines: this.formatters.tracert.hostNotFound(name), effects: NO_EFFECTS, trace }
    const lines = [...this.formatters.ping.settingsNotes(command.settings), ...this.formatters.ping.hostNotFound(name)]
    return { lines, effects: NO_EFFECTS, trace }
  }

  probe(engine: SimulationEngine, stage: ProbeStage, record: RequestRecord): SimCommandOutcome {
    const events = engine.events(stage.fromEventId).filter((event) => event.flowId === record.id)
    const paths = new PduPaths(events, engine.transmissions(stage.fromTransmissionId))
    const { command } = stage
    if (command.kind === 'ping') {
      const result = record.result?.kind === 'ping' ? record.result : null
      return this.ping(stage, command.settings.count, result, events, paths)
    }
    const result: TracertResult = record.result?.kind === 'tracert' ? record.result : { kind: 'tracert', hops: [], ending: null }
    return this.tracert(stage, result, events, paths)
  }

  nslookup(name: string, record: RequestRecord): SimCommandOutcome {
    if (record.result?.kind !== 'dns') return this.aborted()
    return { lines: this.formatters.command.nslookupResult(record.result.answer, name), effects: NO_EFFECTS }
  }

  /**
   * ipconfig /renew, /release like the engine's shell: success on any adapter → the adapters of the new
   * configuration; else the first failure in Windows' words.
   */
  dhcp(engine: SimulationEngine, deviceId: string, record: RequestRecord): SimCommandOutcome {
    if (record.result?.kind !== 'dhcp') return this.aborted()
    const result: DhcpResult = record.result
    const { command } = this.formatters
    const succeeded = result.adapters.some((adapter) => adapter.ok)
    if (succeeded) {
      const views = SimHostViews.adapters(engine, deviceId)
      const lines = result.operation === 'renew' ? command.adapters(views, false) : command.releasedAdapters(views)
      return { lines, effects: result.effects, nextState: engine.network() }
    }
    const failure = result.adapters.find((adapter): adapter is Extract<DhcpAdapterResult, { ok: false }> => !adapter.ok)
    const wireless = SimHostViews.isWireless(engine, deviceId, failure?.portId)
    return { lines: this.dhcpFailure(failure?.reason, wireless), effects: result.effects }
  }

  private dhcpFailure(reason: Extract<DhcpAdapterResult, { ok: false }>['reason'] | undefined, wireless: boolean): TerminalLine[] {
    const { command } = this.formatters
    switch (reason) {
      case 'requestTimedOut':
      case 'dhcpNak':
        return command.renewTimedOut(wireless)
      case 'cableDisconnected':
      case 'portDisabled':
        return command.mediaDisconnected(wireless)
      default:
        return command.dhcpNotPermitted()
    }
  }

  /** Every echo as it happened (equal echoes print exactly like the rule engine); the trace follows the first echo. */
  private ping(stage: ProbeStage, count: number, result: PingResult | null, events: readonly SimEvent[], paths: PduPaths): SimCommandOutcome {
    const echoes = [...(result?.echoes ?? [])].sort((first, second) => first.sequence - second.sequence)
    const outcomes: PingOutcome[] = echoes.map((echo) => ProbeOutcomes.ping(echo, stage.targetIp, events, stage.deviceId))
    // Echoes the client never reported (the device went off): Windows' "General failure".
    while (outcomes.length < count) outcomes.push({ kind: 'generalFailure' })
    const settings = stage.command.kind === 'ping' ? stage.command.settings : null
    const size = settings?.size ?? 0
    const lines = [
      ...(settings ? this.formatters.ping.settingsNotes(settings) : []),
      ...this.formatters.ping.pingEchoes(stage.targetIp, stage.name, outcomes, size),
    ]
    const first = echoes[0]
    const pduId = first && first.kind !== 'localFailure' ? first.requestPduId : null
    return { lines, effects: NO_EFFECTS, trace: paths.trace(pduId, stage.deviceId, first?.kind === 'reply') }
  }

  /** The trace follows the probe that went furthest (highest TTL). */
  private tracert(stage: ProbeStage, result: TracertResult, events: readonly SimEvent[], paths: PduPaths): SimCommandOutcome {
    const { hops, ending } = ProbeOutcomes.tracert(result, stage.targetIp, TracertFormatter.maxTimeoutLines)
    const lines = this.formatters.tracert.tracertLines(stage.targetIp, stage.name, hops, ending)
    let furthest: { pduId: string; ttl: number } | null = null
    for (const event of events) {
      const packet = event.deviceId === stage.deviceId && event.outbound ? PduLayers.ipv4Of(event.outbound) : null
      if (event.pduId === null || packet?.payload.kind !== 'icmp' || packet.payload.type !== 'echoRequest') continue
      if (!furthest || packet.ttl > furthest.ttl) furthest = { pduId: event.pduId, ttl: packet.ttl }
    }
    return { lines, effects: NO_EFFECTS, trace: paths.trace(furthest?.pduId ?? null, stage.deviceId, result.ending?.kind === 'reached') }
  }
}