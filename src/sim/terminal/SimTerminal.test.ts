import { describe, expect, it } from 'vitest'
import type { TerminalLine } from '../../domain'
import { networkEngine } from '../../engine'
import { editLink, textOf } from '../../engine/testLabs'
import { officeLab } from '../../engine/testNetworks'
import type { SimulationEngine } from '../contract'
import { createSimulation } from '../createSimulation'
import { SimTerminal } from './index'

function texts(lines: readonly TerminalLine[]): string[] {
  return textOf(lines)
}

/** Steps the engine until `done` holds (simulation mode: the learner presses step). */
function stepUntil(engine: SimulationEngine, done: () => boolean): number {
  let steps = 0
  while (!done()) {
    if (engine.isIdle()) throw new Error('Engine idle before the command finished')
    engine.step()
    steps += 1
  }
  return steps
}

describe('SimTerminal: immediate commands', () => {
  it('answers help, ipconfig and usage errors at once, without requests', () => {
    const lab = officeLab()
    const engine = createSimulation(lab)
    for (const line of ['help', 'ipconfig /all', 'ping', 'ping -n x 8.8.8.8', 'tracert', 'nslookup', 'hostname', '']) {
      const start = SimTerminal.start(engine, 'pc1', line)
      expect(start.kind, line).toBe('done')
      if (start.kind === 'done') expect(start.outcome.lines, line).toEqual(networkEngine.runCommand(lab, 'pc1', line).lines)
    }
    expect(engine.requests()).toEqual([])
  })

  it('refuses devices without a terminal and devices that are off, and throws for unknown ones', () => {
    const engine = createSimulation(officeLab())
    expect(SimTerminal.run(engine, 'switch', 'ipconfig').lines).toEqual(networkEngine.runCommand(officeLab(), 'switch', 'ipconfig').lines)
    expect(() => SimTerminal.start(engine, 'nobody', 'ipconfig')).toThrow()
  })
})

describe('SimTerminal: pending commands', () => {
  it('follows a ping by name through its DNS lookup with the brief API (one handle, collect until done)', () => {
    const engine = createSimulation(officeLab())
    const terminal = new SimTerminal()
    const start = terminal.start(engine, 'pc1', 'ping google.com')
    expect(start.kind).toBe('pending')
    if (start.kind !== 'pending') return
    expect(engine.request(start.requestId)?.request.kind).toBe('dnsQuery')
    expect(terminal.collect(engine, start.requestId)).toBeNull()
    let outcome = terminal.collect(engine, start.requestId)
    stepUntil(engine, () => {
      outcome = terminal.collect(engine, start.requestId)
      return outcome !== null
    })
    const expected = networkEngine.runCommand(officeLab(), 'pc1', 'ping google.com')
    expect(outcome).toMatchObject({ lines: expected.lines, trace: expected.trace, effects: [] })
    expect(engine.requests().map((record) => record.request.kind)).toEqual(['dnsQuery', 'ping'])
  })

  it('hands the next request to the caller with the static API (SimTerminal.collect = advance)', () => {
    const engine = createSimulation(officeLab())
    const first = SimTerminal.start(engine, 'pc1', 'tracert google.com')
    if (first.kind !== 'pending') throw new Error('expected a pending command')
    expect(SimTerminal.collect(engine, first.requestId)).toEqual(first)
    engine.runUntilDone(first.requestId)
    const second = SimTerminal.collect(engine, first.requestId)
    if (second.kind !== 'pending') throw new Error('expected the tracert request')
    expect(second.requestId).not.toBe(first.requestId)
    engine.runUntilDone(second.requestId)
    const done = SimTerminal.collect(engine, second.requestId)
    expect(done.kind === 'done' && done.outcome.lines).toEqual(networkEngine.runCommand(officeLab(), 'pc1', 'tracert google.com').lines)
  })

  it('prints a host-not-found ping without sending an echo', () => {
    const engine = createSimulation(officeLab())
    const outcome = SimTerminal.run(engine, 'pc1', 'ping -t yok.example')
    expect(outcome).toEqual({ ...networkEngine.runCommand(officeLab(), 'pc1', 'ping -t yok.example'), effects: [] })
    expect(engine.requests().map((record) => record.request.kind)).toEqual(['dnsQuery'])
  })

  it('applies ipconfig /renew effects to the engine and returns them for the lab document', () => {
    const lab = officeLab()
    const engine = createSimulation(lab)
    const released = SimTerminal.run(engine, 'pc2', 'ipconfig /release')
    expect(released.effects).toEqual([{ kind: 'dhcpLeaseReleased', clientId: 'pc2', portId: 'eth0' }])
    expect(released.nextState).toBe(engine.network())
    const renewed = SimTerminal.run(engine, 'pc2', 'ipconfig /renew')
    expect(renewed.effects).toMatchObject([{ kind: 'dhcpLeaseBound', clientId: 'pc2', portId: 'eth0', ip: '192.168.1.101' }])
    expect(renewed.lines).toEqual(networkEngine.runCommand(lab, 'pc2', 'ipconfig /renew').lines)
  })

  it('prints every echo when they differ (the target is unplugged in the middle)', () => {
    const engine = createSimulation(officeLab())
    const start = SimTerminal.start(engine, 'pc1', 'ping 192.168.1.150')
    if (start.kind !== 'pending') throw new Error('expected a pending ping')
    engine.runUntil(engine.time + 1500)
    engine.reconfigure(editLink(engine.network(), 'printerLink', (link) => ({ ...link, connected: false })))
    engine.runUntilDone(start.requestId)
    const done = SimTerminal.collect(engine, start.requestId)
    if (done.kind !== 'done') throw new Error('expected the outcome')
    expect(texts(done.outcome.lines)).toEqual([
      '',
      'Pinging 192.168.1.150 with 32 bytes of data:',
      'Reply from 192.168.1.150: bytes=32 time=1ms TTL=128',
      'Reply from 192.168.1.150: bytes=32 time=2ms TTL=128',
      'Request timed out.',
      'Request timed out.',
      '',
      'Ping statistics for 192.168.1.150:',
      '    Packets: Sent = 4, Received = 2, Lost = 2 (50% loss),',
      'Approximate round trip times in milli-seconds:',
      '    Minimum = 1ms, Maximum = 2ms, Average = 2ms',
    ])
    expect(done.outcome.trace).toEqual({ path: ['pc1', 'switch', 'printer'], ok: true })
  })
})

describe('SimTerminal: arp', () => {
  it('lists the ARP cache in Windows format, empty after settle', () => {
    const engine = createSimulation(officeLab())
    expect(texts(SimTerminal.run(engine, 'pc1', 'arp -a').lines)).toEqual(['No ARP Entries Found.'])
    SimTerminal.run(engine, 'pc1', 'ping -n 1 192.168.1.150')
    SimTerminal.run(engine, 'pc1', 'ping -n 1 192.168.1.1')
    const printerMac = engine.network().devices.find((device) => device.id === 'printer')?.ports[0]?.mac ?? ''
    const routerMac = engine.network().devices.find((device) => device.id === 'router')?.ports[0]?.mac ?? ''
    const windowsMac = (mac: string) => mac.toLowerCase().replaceAll(':', '-')
    expect(texts(SimTerminal.run(engine, 'pc1', 'arp -a').lines)).toEqual([
      '',
      'Interface: 192.168.1.20 --- 0xb',
      '  Internet Address      Physical Address      Type',
      `  192.168.1.1           ${windowsMac(routerMac)}     dynamic`,
      `  192.168.1.150         ${windowsMac(printerMac)}     dynamic`,
    ])
    expect(texts(SimTerminal.run(engine, 'pc1', 'arp -g 192.168.1.1').lines)).toHaveLength(4)
  })

  it('clears the cache with arp -d (no output) and shows the usage for anything else', () => {
    const engine = createSimulation(officeLab())
    SimTerminal.run(engine, 'pc1', 'ping -n 1 192.168.1.150')
    const cleared = SimTerminal.start(engine, 'pc1', 'arp -d *')
    expect(cleared.kind).toBe('pending')
    if (cleared.kind === 'pending') engine.runUntilDone(cleared.requestId)
    expect(cleared.kind === 'pending' && SimTerminal.collect(engine, cleared.requestId)).toEqual({ kind: 'done', outcome: { lines: [], effects: [] } })
    expect(texts(SimTerminal.run(engine, 'pc1', 'arp -a').lines)).toEqual(['No ARP Entries Found.'])
    expect(texts(SimTerminal.run(engine, 'pc1', 'arp').lines)[1]).toContain('Displays and modifies')
    expect(texts(SimTerminal.run(engine, 'pc1', 'arp -d 192.168.1.150').lines)[1]).toContain('Displays and modifies')
  })
})
