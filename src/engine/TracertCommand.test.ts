import { describe, expect, it } from 'vitest'
import type { CommandResult } from '../domain/EngineContract'
import type { NetworkState } from '../domain/NetworkTypes'
import { DefaultNetworkEngine } from './DefaultNetworkEngine'
import { officeNetwork, updateDevice, updateHost, updateLink, vlanNetwork } from './testFixtures'

const engine = new DefaultNetworkEngine()

function run(state: NetworkState, deviceId: string, line: string): CommandResult {
  return engine.runCommand(state, deviceId, line)
}

function texts(result: CommandResult): string[] {
  return result.lines.map((line) => line.text ?? '')
}

describe('tracert — complete traces', () => {
  it('lists the router, then the internet destination (no fictional ISP hops)', () => {
    const result = run(officeNetwork(), 'pc1', 'tracert 8.8.8.8')
    expect(texts(result)).toEqual([
      '',
      'Tracing route to 8.8.8.8 over a maximum of 30 hops',
      '',
      '  1    <1 ms    <1 ms    <1 ms  192.168.1.1',
      '  2    14 ms    15 ms    14 ms  8.8.8.8',
      '',
      'Trace complete.',
    ])
    expect(result.trace).toEqual({ ok: true, path: ['pc1', 'switch', 'router', 'internet'] })
  })

  it('skips switches: a host in the same segment is the only hop', () => {
    const lines = texts(run(officeNetwork(), 'pc1', 'tracert 192.168.1.150'))
    expect(lines.filter((line) => /^ {2}\d/.test(line))).toEqual(['  1    <1 ms    <1 ms    <1 ms  192.168.1.150'])
  })

  it('shows the gateway hop for another VLAN', () => {
    const lines = texts(run(vlanNetwork(), 'kasa', 'tracert -d 192.168.20.50'))
    expect(lines.filter((line) => /^ {2}\d/.test(line))).toEqual([
      '  1    <1 ms    <1 ms    <1 ms  192.168.10.1',
      '  2     2 ms     3 ms     2 ms  192.168.20.50',
    ])
  })

  it('needs one hop to reach the router itself', () => {
    const lines = texts(run(officeNetwork(), 'pc1', 'tracert 192.168.1.1'))
    expect(lines.filter((line) => /^ {2}\d/.test(line))).toEqual(['  1    <1 ms    <1 ms    <1 ms  192.168.1.1'])
  })

  it('resolves names first', () => {
    const result = run(officeNetwork(), 'pc1', 'TRACERT google.com')
    expect(texts(result).slice(1, 3)).toEqual(['Tracing route to google.com [142.250.187.206]', 'over a maximum of 30 hops:'])
    expect(texts(result)).toContain('  2    14 ms    15 ms    14 ms  142.250.187.206')
  })
})

describe('tracert — failures', () => {
  it('times out after the router when the WAN is down (four lines, then complete)', () => {
    const state = updateDevice(officeNetwork(), 'router', (router) => ({ ...router, wanUp: false }))
    const result = run(state, 'pc1', 'tracert 8.8.8.8')
    const lines = texts(result)
    expect(lines).toContain('  1    <1 ms    <1 ms    <1 ms  192.168.1.1')
    expect(lines.filter((line) => line.endsWith('Request timed out.'))).toEqual([
      '  2     *        *        *     Request timed out.',
      '  3     *        *        *     Request timed out.',
      '  4     *        *        *     Request timed out.',
      '  5     *        *        *     Request timed out.',
    ])
    expect(lines[lines.length - 1]).toBe('Trace complete.')
    expect(result.trace).toEqual({ ok: false, path: ['pc1', 'switch', 'router'] })
  })

  it('reports the gateway when the router cannot deliver', () => {
    const lines = texts(run(vlanNetwork(), 'kasa', 'tracert 192.168.20.77'))
    expect(lines).toContain('  1    <1 ms    <1 ms    <1 ms  192.168.10.1')
    expect(lines).toContain('  2  192.168.10.1  reports: Destination host unreachable.')
  })

  it('reports its own address when a local target does not answer', () => {
    expect(texts(run(officeNetwork(), 'pc1', 'tracert 192.168.1.99'))).toContain(
      '  1  192.168.1.20  reports: Destination host unreachable.',
    )
  })

  it('times out after the router when the destination has no way back', () => {
    const state = updateHost(vlanNetwork(), 'guestPc', { gateway: '' })
    const lines = texts(run(state, 'kasa', 'tracert 192.168.20.50'))
    expect(lines).toContain('  1    <1 ms    <1 ms    <1 ms  192.168.10.1')
    expect(lines).toContain('  2     *        *        *     Request timed out.')
  })

  it('fails at the source without a cable or with a duplicate address', () => {
    const unplugged = updateLink(officeNetwork(), 'pc1Link', { connected: false })
    const result = run(unplugged, 'pc1', 'tracert 8.8.8.8')
    expect(texts(result)).toContain('  1  General failure.')
    expect(result.trace).toEqual({ ok: false, path: ['pc1'] })

    const conflict = updateHost(officeNetwork(), 'printer', { ip: '192.168.1.20' })
    expect(texts(run(conflict, 'pc1', 'tracert 8.8.8.8'))).toContain('  1  General failure.')
  })

  it('cannot resolve an unknown name', () => {
    const result = run(officeNetwork(), 'pc1', 'tracert yok.example')
    expect(texts(result)).toEqual(['Unable to resolve target system name yok.example.'])
    expect(result.trace).toEqual({ ok: false, path: ['pc1'] })
  })

  it('rejects bad options and a missing target without sending anything', () => {
    const badOption = run(officeNetwork(), 'pc1', 'tracert -x 8.8.8.8')
    expect(badOption.lines).toEqual([
      { kind: 'error', text: 'Bad option -x.' },
      { kind: 'error', message: { key: 'engine:usage.tracert' } },
    ])
    expect(badOption.trace).toBeUndefined()
    expect(run(officeNetwork(), 'pc1', 'tracert').lines).toEqual([{ kind: 'error', message: { key: 'engine:usage.tracert' } }])
  })
})
