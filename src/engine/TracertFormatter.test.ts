import { describe, expect, it } from 'vitest'
import type { TerminalLine } from '../domain/EngineContract'
import { TracertFormatter } from './TracertFormatter'

const formatter = new TracertFormatter()

function texts(lines: TerminalLine[]): string[] {
  return lines.map((line) => line.text ?? '')
}

describe('TracertFormatter', () => {
  it('prints a completed trace in the Windows layout', () => {
    const lines = texts(
      formatter.tracert(
        '8.8.8.8',
        null,
        [
          { ip: '192.168.1.1', baseTimeMs: 0 },
          { ip: '8.8.8.8', baseTimeMs: 14 },
        ],
        { kind: 'complete' },
      ),
    )
    expect(lines).toEqual([
      '',
      'Tracing route to 8.8.8.8 over a maximum of 30 hops',
      '',
      '  1    <1 ms    <1 ms    <1 ms  192.168.1.1',
      '  2    14 ms    15 ms    14 ms  8.8.8.8',
      '',
      'Trace complete.',
    ])
  })

  it('puts the resolved address on the header for names', () => {
    const lines = texts(formatter.tracert('142.250.187.206', 'google.com', [], { kind: 'complete' }))
    expect(lines.slice(0, 4)).toEqual(['', 'Tracing route to google.com [142.250.187.206]', 'over a maximum of 30 hops:', ''])
  })

  it('prints at most four timeout lines after the last answering hop', () => {
    const lines = texts(formatter.tracert('8.8.8.8', null, [{ ip: '192.168.1.1', baseTimeMs: 0 }], { kind: 'timedOut' }))
    expect(lines.slice(4, 8)).toEqual([
      '  2     *        *        *     Request timed out.',
      '  3     *        *        *     Request timed out.',
      '  4     *        *        *     Request timed out.',
      '  5     *        *        *     Request timed out.',
    ])
    expect(lines.slice(8)).toEqual(['', 'Trace complete.'])
  })

  it('reports an unreachable destination on the next hop line', () => {
    const lines = texts(formatter.tracert('192.168.1.99', null, [], { kind: 'unreachable', reporterIp: '192.168.1.20' }))
    expect(lines).toContain('  1  192.168.1.20  reports: Destination host unreachable.')
  })

  it('reports a general failure when nothing can be sent', () => {
    expect(texts(formatter.tracert('8.8.8.8', null, [], { kind: 'generalFailure' }))).toContain('  1  General failure.')
  })

  it('cannot resolve an unknown name', () => {
    expect(texts(formatter.hostNotFound('yok.example'))).toEqual(['Unable to resolve target system name yok.example.'])
  })
})

describe('TracertFormatter — hop limit (v2 routing loops)', () => {
  it('prints the hop lines and nothing after them', () => {
    const hops = [
      { ip: '10.1.1.1', baseTimeMs: 0 },
      { ip: '10.0.12.2', baseTimeMs: 1 },
    ]
    expect(formatter.tracert('10.9.1.1', null, hops, { kind: 'hopLimit' }).map((line: TerminalLine) => line.text ?? '')).toEqual([
      '',
      'Tracing route to 10.9.1.1 over a maximum of 30 hops',
      '',
      '  1    <1 ms    <1 ms    <1 ms  10.1.1.1',
      '  2     1 ms     2 ms     1 ms  10.0.12.2',
      '',
      'Trace complete.',
    ])
    expect(TracertFormatter.maxHops).toBe(30)
  })
})
