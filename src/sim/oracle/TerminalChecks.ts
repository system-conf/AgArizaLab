// Test-only (O3): terminal text of §10.2 ("ping / tracert terminal text identical, except §10.3"), plus
// nslookup and ipconfig (/all, /renew, /release): I3's SimTerminal on a fresh engine vs the rule
// engine's runCommand. Lines, the map trace of a successful probe and the DHCP result state must match.
import type { NetworkState } from '../../domain'
import { Ipv4, L3Interfaces, networkEngine, TerminalAvailability, Topology } from '../../engine'
import { type Divergence, Divergences } from './Divergences'
import type { Mismatch, OracleTally } from './OracleChecks'
import type { OracleSimulation } from './OracleSimulation'

export class TerminalChecks {
  private readonly state: NetworkState
  private readonly sim: OracleSimulation
  private readonly tally: OracleTally

  constructor(state: NetworkState, sim: OracleSimulation, tally: OracleTally) {
    this.state = state
    this.sim = sim
    this.tally = tally
  }

  /** Whether the device has a command prompt at all (the shells print the same refusal otherwise). */
  static hasTerminal(state: NetworkState, deviceId: string): boolean {
    return TerminalAvailability.isAvailable(Topology.of(state).require(deviceId))
  }

  /** The scripted command list of one host: ipconfig, pings, tracerts, nslookups, renew / release. */
  static script(targets: readonly string[]): string[] {
    return [
      'ipconfig',
      'ipconfig /all',
      'ping 8.8.8.8',
      ...targets.map((target) => `ping ${target}`),
      'ping google.com',
      'tracert 8.8.8.8',
      ...targets.slice(0, 1).map((target) => `tracert ${target}`),
      'nslookup google.com',
      'nslookup intranet.local',
      'ipconfig /renew',
      'ipconfig /release',
    ]
  }

  check(deviceId: string, line: string): Mismatch[] {
    const divergence = this.divergence(deviceId, line)
    if (divergence) {
      this.tally.skip(divergence)
      return []
    }
    this.tally.count('terminal')
    const engine = networkEngine.runCommand(this.state, deviceId, line)
    const sim = this.sim.terminal(deviceId, line)
    const engineView = { lines: engine.lines, trace: engine.trace?.ok ? engine.trace : undefined, nextState: engine.nextState }
    const simView = { lines: sim.lines, trace: engine.trace?.ok ? sim.trace : undefined, nextState: engine.nextState === undefined ? undefined : sim.nextState }
    if (JSON.stringify(engineView) === JSON.stringify(simView)) return []
    const text = (lines: typeof engine.lines): string[] => lines.map((entry) => entry.text ?? `[${entry.message?.key ?? ''}]`)
    const sameText = JSON.stringify(text(engine.lines)) === JSON.stringify(text(sim.lines))
    return [
      {
        property: 'terminal',
        deviceId,
        target: line,
        engine: sameText ? { trace: engineView.trace, nextStateDiffers: true } : text(engine.lines),
        sim: sameText ? { trace: simView.trace } : text(sim.lines),
      },
    ]
  }

  /** The accepted divergence a command line falls under, if any (see Divergences). */
  private divergence(deviceId: string, line: string): Divergence | null {
    const device = Topology.of(this.state).require(deviceId)
    if (!device.powered || !TerminalChecks.hasTerminal(this.state, deviceId)) return null
    const [command = '', option = ''] = line.split(' ')
    if (command === 'ipconfig' && (option === '/renew' || option === '/release')) return Divergences.dhcp(this.state, deviceId)
    if (command === 'nslookup') return Divergences.deepDnsChain(this.state) ? 'deepDnsChain' : null
    if (command !== 'ping' && command !== 'tracert') return null
    if (!Ipv4.isValid(option)) {
      if (Divergences.deepDnsChain(this.state)) return 'deepDnsChain'
      const resolved = networkEngine.resolve(this.state, deviceId, option)
      return resolved.ok ? this.probeDivergence(deviceId, resolved.ip, command) : null
    }
    return this.probeDivergence(deviceId, option, command)
  }

  private probeDivergence(deviceId: string, targetIp: string, command: string): Divergence | null {
    const reach = networkEngine.reach(this.state, deviceId, targetIp)
    if (Divergences.gatewayNotRouter(this.state, deviceId, targetIp, reach)) return 'gatewayNotRouter'
    if (command === 'tracert') return Divergences.tracertRouterReports(this.state, deviceId, targetIp, reach) ? 'tracertRouterReports' : null
    if (!reach.ok) return null
    const topology = Topology.of(this.state)
    const routers = reach.path.filter((id) => {
      const device = topology.find(id)
      return device !== undefined && L3Interfaces.isRouter(device)
    }).length
    return Divergences.replyTtl(this.state, targetIp, routers) ? 'replyTtl' : null
  }
}
