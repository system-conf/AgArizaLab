// Golden tests (docs/SIMULATION.md §10.1, §10.3): the simulator's terminal prints what the rule engine's
// HostCommandShell prints, command by command on fresh engines, except for the accepted divergences.
import { describe, expect, it } from 'vitest'
import type { CommandResult, NetworkState, TerminalLine } from '../../domain'
import { networkEngine } from '../../engine'
import { DeviceAddresses } from '../../net/DeviceAddresses'
import { L3Interfaces } from '../../net/L3Interfaces'
import { TerminalAvailability } from '../../net/TerminalAvailability'
import type { SimSnapshot, SimulationEngine } from '../contract'
import { createSimulation } from '../createSimulation'
import { goldenLabs } from './goldenLabs'
import { type SimCommandOutcome, SimTerminal } from './index'

/** A fresh, settled engine per command (restore of the snapshot taken right after `create`). */
class FreshEngine {
  private readonly engine: SimulationEngine
  private readonly fresh: SimSnapshot

  constructor(network: NetworkState) {
    this.engine = createSimulation(network)
    this.fresh = this.engine.snapshot()
  }

  run(deviceId: string, line: string): SimCommandOutcome {
    this.engine.restore(this.fresh)
    return SimTerminal.run(this.engine, deviceId, line)
  }
}

function render(lines: readonly TerminalLine[]): string[] {
  return lines.map((line) => (line.message ? `[${line.kind}] ${line.message.key}` : `[${line.kind}] ${line.text}`))
}

/** Accepted divergence §10.3.2: routers answer with their own initial TTL (255 − hops). */
function withoutTtl(lines: readonly string[]): string[] {
  return lines.map((line) => line.replace(/TTL=\d+/, 'TTL=*'))
}

function commandsFor(state: NetworkState, deviceId: string): string[] {
  const targets = state.devices.filter((device) => device.id !== deviceId).flatMap((device) => DeviceAddresses.of(device))
  return [
    'help',
    'ipconfig',
    'ipconfig /all',
    'ipconfig /bogus',
    'nslookup',
    'nslookup google.com',
    'nslookup yok.example',
    'ping',
    'ping -n 0 8.8.8.8',
    'ping 8.8.8.8',
    'ping -n 2 -l 64 google.com',
    'ping -t google.com',
    'ping yok.example',
    'tracert 8.8.8.8',
    'tracert google.com',
    'hostname',
    ...targets.map((ip) => `ping -n 1 ${ip}`),
    ...targets.map((ip) => `tracert ${ip}`),
    'ipconfig /release',
    'ipconfig /renew',
  ]
}

interface Difference {
  deviceId: string
  line: string
  engine: string[]
  sim: string[]
}

const REPORTS = /^\[output\]\s+(\d+) {2}(\S+) {2}reports: Destination host unreachable\.$/
const HOP = /^\[output\]\s+(\d+) .* {2}(\S+)$/

/**
 * Addition after S2 (§10.3): a router without a route to a private address shows up once as a normal hop
 * (time exceeded at TTL n) and reports "unreachable" at TTL n + 1; the engine prints only the "reports:"
 * line, at hop n. Folds the simulator's extra hop line into the engine's form.
 */
function foldReportingHop(lines: readonly string[]): string[] {
  const at = lines.findIndex((line) => REPORTS.test(line))
  const reporter = lines[at]?.match(REPORTS)
  const hop = lines[at - 1]?.match(HOP)
  if (!reporter || !hop || hop[2] !== reporter[2] || Number(hop[1]) + 1 !== Number(reporter[1])) return [...lines]
  const line = `[output] ${String(hop[1]).padStart(3)}  ${reporter[2]}  reports: Destination host unreachable.`
  return [...lines.slice(0, at - 1), line, ...lines.slice(at + 1)]
}

/**
 * §10.3.1: the gateway is a host: the engine reports "unreachable" from the own address, the simulator's
 * echoes time out (ARP succeeds, the host drops the packet).
 */
function gatewayNotARouter(engine: readonly string[], sim: readonly string[]): boolean {
  const asTimeouts = engine.map((line) => line.replace(/^\[output\] Reply from \S+: Destination host unreachable\.$/, '[output] Request timed out.'))
  const lost = asTimeouts.map((line) => line.replace(/Received = \d+, Lost = \d+ \(\d+% loss\)/, 'LOSS'))
  const simLost = sim.map((line) => line.replace(/Received = \d+, Lost = \d+ \(\d+% loss\)/, 'LOSS'))
  if (JSON.stringify(engine) !== JSON.stringify(asTimeouts) && JSON.stringify(lost) === JSON.stringify(simLost)) return true
  // tracert: the engine's "reports:" line becomes the simulator's timeout lines.
  const reports = engine.findIndex((line) => /reports: Destination host unreachable\.$/.test(line))
  return reports > 0 && JSON.stringify(engine.slice(0, reports)) === JSON.stringify(sim.slice(0, reports)) && sim.slice(reports, -2).every((line) => line.endsWith('Request timed out.'))
}

type Divergence = 'routerReplyTtl' | 'tracertReportingHop' | 'gatewayNotARouter'

/** The accepted divergence that explains a difference (§10.3 and the additions after S2), if any. */
function divergence(state: NetworkState, line: string, engine: readonly string[], sim: readonly string[]): Divergence | null {
  const target = line.split(' ').at(-1) ?? ''
  const owner = state.devices.find((device) => DeviceAddresses.has(device, target))
  const routerTarget = owner !== undefined && L3Interfaces.isRouter(owner)
  if (routerTarget && line.startsWith('ping') && JSON.stringify(withoutTtl(engine)) === JSON.stringify(withoutTtl(sim))) return 'routerReplyTtl'
  if (line.startsWith('tracert') && JSON.stringify(foldReportingHop(sim)) === JSON.stringify(engine)) return 'tracertReportingHop'
  if (gatewayNotARouter(engine, sim)) return 'gatewayNotARouter'
  return null
}

interface LabComparison {
  commands: number
  mismatches: Difference[]
  accepted: Array<Difference & { divergence: Divergence }>
}

function compareLab(name: string, state: NetworkState): LabComparison {
  const sim = new FreshEngine(state)
  const comparison: LabComparison = { commands: 0, mismatches: [], accepted: [] }
  for (const device of state.devices.filter((candidate) => TerminalAvailability.isAvailable(candidate))) {
    for (const line of commandsFor(state, device.id)) {
      const expected: CommandResult = networkEngine.runCommand(state, device.id, line)
      const actual = sim.run(device.id, line)
      const difference: Difference = { deviceId: device.id, line, engine: render(expected.lines), sim: render(actual.lines) }
      comparison.commands += 1
      if (JSON.stringify(difference.engine) !== JSON.stringify(difference.sim)) {
        const reason = divergence(state, line, difference.engine, difference.sim)
        if (reason) comparison.accepted.push({ ...difference, divergence: reason })
        else comparison.mismatches.push(difference)
        continue
      }
      const label = `${name} ${device.id}> ${line}`
      if (expected.nextState) expect(actual.nextState, label).toEqual(expected.nextState)
      if (expected.trace?.ok) expect(actual.trace, label).toEqual(expected.trace)
      expect(actual.trace === undefined, label).toBe(expected.trace === undefined)
    }
  }
  return comparison
}

function describeDifference(entry: Difference): string {
  return `${entry.deviceId}> ${entry.line}\n--- engine\n${entry.engine.join('\n')}\n--- sim\n${entry.sim.join('\n')}`
}

describe('SimTerminal golden output (rule engine = oracle)', () => {
  it.each(goldenLabs().map(([name, state]) => [name, state] as const))('prints like the rule engine on %s', (name, state) => {
    const { commands, mismatches } = compareLab(name, state)
    expect(commands).toBeGreaterThan(20)
    expect(mismatches.map(describeDifference)).toEqual([])
  })

  it('differs only where SIMULATION.md accepts it, and those cases do occur', () => {
    const accepted = goldenLabs().flatMap(([name, state]) => compareLab(name, state).accepted.map((entry) => `${name}: ${entry.deviceId}> ${entry.line} (${entry.divergence})`))
    expect(accepted.some((entry) => entry.endsWith('(routerReplyTtl)'))).toBe(true)
    expect(accepted.some((entry) => entry.endsWith('(tracertReportingHop)'))).toBe(true)
    expect(accepted.some((entry) => entry.endsWith('(gatewayNotARouter)'))).toBe(true)
  })
})