// Limits that keep the simulator bounded (docs/SIMULATION.md §5.6): settle budget, retained logs, the
// ARP queue per next hop and the size of a ping record.
import { describe, expect, it } from 'vitest'
import { PingOptions } from '../engine/PingOptions'
import { officeLab } from '../engine/testNetworks'
import { type EchoResult, PingTally, SIM_LIMITS } from './contract'
import { createSimulation } from './createSimulation'
import { flatTestLab, flatTestLabAddress, flatTestLabHost } from './perf/flatTestLab'

const ping = { kind: 'ping', deviceId: 'pc1', targetIp: '192.168.1.150', count: 1, size: 32 } as const

describe('settle budget', () => {
  it('settles small labs completely', () => {
    expect(createSimulation(officeLab()).settleTruncated).toBe(false)
    expect(createSimulation(officeLab(), { settle: false }).settleTruncated).toBe(false)
  })

  it('stops at the task budget, deterministically, and the engine stays usable', () => {
    const lab = flatTestLab(40)
    const first = createSimulation(lab, { settleBudget: { tasks: 300 } })
    const second = createSimulation(lab, { settleBudget: { tasks: 300 } })
    expect(first.settleTruncated).toBe(true)
    expect(first.isIdle()).toBe(false)
    expect(first.events()).toEqual([])
    expect(JSON.stringify(first.snapshot())).toBe(JSON.stringify(second.snapshot()))

    // The rest of the start-up traffic runs with the next steps; then the network works as usual.
    expect(first.runUntilIdle().stoppedBy).toBe('idle')
    const id = first.inject({ kind: 'ping', deviceId: flatTestLabHost(0), targetIp: flatTestLabAddress(30), count: 1, size: 32 })
    first.runUntilDone(id)
    expect(first.request(id)?.result).toMatchObject({ kind: 'ping', echoes: [{ kind: 'reply' }] })
  })

  it('stops at the virtual-time budget (DHCP still running)', () => {
    const engine = createSimulation(officeLab(), { settleBudget: { timeMs: 0 } })
    expect(engine.settleTruncated).toBe(true)
    expect(engine.time).toBe(0)
    expect(engine.nextTaskTime()).toBeGreaterThan(0)
  })
})

describe('retained logs', () => {
  it('keeps the newest maxRetainedEvents events and transmissions, trimmed in batches', () => {
    const engine = createSimulation(officeLab(), { maxRetainedEvents: 10 })
    for (let run = 0; run < 5; run += 1) engine.runUntilDone(engine.inject({ ...ping, targetIp: '8.8.8.8' }))
    const { counters } = engine.snapshot()
    const events = engine.events()
    expect(events).toHaveLength(10)
    expect(events.map((event) => event.id)).toEqual(Array.from({ length: 10 }, (_, index) => counters.event - 10 + index))
    expect(engine.transmissions()).toHaveLength(10)
    expect(engine.transmissions().at(-1)?.id).toBe(counters.transmission - 1)
    expect(engine.events(counters.event - 3).map((event) => event.id)).toEqual([counters.event - 3, counters.event - 2, counters.event - 1])
  })
})

describe('ARP queue per next hop', () => {
  it(`holds ${SIM_LIMITS.arpPendingPerNextHop} packets per unresolved next hop and drops further ones silently`, () => {
    const engine = createSimulation(officeLab())
    const ids = Array.from({ length: 6 }, () => engine.inject({ ...ping, targetIp: '192.168.1.77' }))
    engine.runUntilIdle()
    const actions = engine.events().filter((event) => event.deviceId === 'pc1' && event.protocol === 'icmp' && event.inbound === null)
    expect(actions.slice(0, 6).map((event) => event.reason ?? event.action)).toEqual(['buffered', 'buffered', 'buffered', 'buffered', 'arpQueueFull', 'arpQueueFull'])
    expect(engine.events().filter((event) => event.reason === 'arpQueueFull').map((event) => event.layer)).toEqual([2, 2])
    // Buffered echoes end with Windows' unreachable from the own address; dropped ones simply time out.
    const kinds = ids.map((id) => {
      const result = engine.request(id)?.result
      return result?.kind === 'ping' ? result.echoes[0]?.kind : undefined
    })
    expect(kinds).toEqual(['unreachable', 'unreachable', 'unreachable', 'unreachable', 'timeout', 'timeout'])
    expect(engine.runtime('pc1')?.link.pending).toEqual([])
  })
})

describe('ping records', () => {
  it('keep the latest echoes and counters over all of them', () => {
    const engine = createSimulation(officeLab())
    const id = engine.inject({ ...ping, count: 1_000_000_000 })
    engine.runUntil(250_000, 1_000_000)
    const result = engine.request(id)?.result
    if (result?.kind !== 'ping') throw new Error('no ping result')
    expect(result.stats.results).toBeGreaterThan(SIM_LIMITS.echoResultsKept * 2)
    expect(result.echoes).toHaveLength(SIM_LIMITS.echoResultsKept)
    expect(result.echoes.at(-1)?.sequence).toBe(result.stats.results)
    expect(result.echoes[0]?.sequence).toBe(result.stats.results - SIM_LIMITS.echoResultsKept + 1)
    expect(result.stats).toMatchObject({ replies: result.stats.results, errors: 0, timeouts: 0, localFailures: 0 })
    expect(result.stats.minRttMs).not.toBeNull()
    expect(result.stats.totalRttMs).toBeGreaterThanOrEqual((result.stats.minRttMs ?? 0) * result.stats.results)
    const session = engine.runtime('pc1')?.network.sessions.find((candidate) => candidate.requestId === id)
    expect(session?.kind === 'ping' && session.result?.echoes.length).toBe(SIM_LIMITS.echoResultsKept)
  })

  it('count every kind of echo result', () => {
    const echoes: EchoResult[] = [
      { kind: 'reply', sequence: 1, requestPduId: 'p1', fromIp: '10.0.0.1', ttl: 128, bytes: 32, rttMs: 4 },
      { kind: 'timeout', sequence: 2, requestPduId: 'p2' },
      { kind: 'unreachable', sequence: 3, requestPduId: 'p3', fromIp: '10.0.0.9', code: 'host' },
      { kind: 'reply', sequence: 4, requestPduId: 'p4', fromIp: '10.0.0.1', ttl: 128, bytes: 32, rttMs: 2 },
      { kind: 'localFailure', sequence: 5, reason: 'noLink' },
    ]
    expect(PingTally.of(echoes)).toEqual({
      kind: 'ping',
      echoes,
      stats: { results: 5, replies: 2, errors: 1, timeouts: 1, localFailures: 1, minRttMs: 2, maxRttMs: 4, totalRttMs: 6 },
    })
  })

  it('always hold every echo the terminal prints', () => {
    expect(PingOptions.maxCount).toBeLessThanOrEqual(SIM_LIMITS.echoResultsKept)
  })
})
