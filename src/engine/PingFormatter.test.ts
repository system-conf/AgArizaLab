import { describe, expect, it } from 'vitest'
import { PingFormatter } from './PingFormatter'

const formatter = new PingFormatter()
const standard = { count: 4, size: 32 }

describe('PingFormatter', () => {
  it('formats a successful ping with statistics', () => {
    const text = formatter
      .ping('8.8.8.8', null, { kind: 'reply', fromIp: '8.8.8.8', ttl: 117, baseTimeMs: 14 }, standard)
      .map((line) => line.text ?? '')
    expect(text).toEqual([
      '',
      'Pinging 8.8.8.8 with 32 bytes of data:',
      'Reply from 8.8.8.8: bytes=32 time=14ms TTL=117',
      'Reply from 8.8.8.8: bytes=32 time=15ms TTL=117',
      'Reply from 8.8.8.8: bytes=32 time=14ms TTL=117',
      'Reply from 8.8.8.8: bytes=32 time=16ms TTL=117',
      '',
      'Ping statistics for 8.8.8.8:',
      '    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),',
      'Approximate round trip times in milli-seconds:',
      '    Minimum = 14ms, Maximum = 16ms, Average = 15ms',
    ])
  })

  it('counts unreachable replies as received, like Windows does', () => {
    const text = formatter.ping('192.168.1.9', null, { kind: 'unreachable', fromIp: '192.168.1.20' }, standard).map((line) => line.text)
    expect(text).toContain('    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),')
    expect(text).not.toContain('Approximate round trip times in milli-seconds:')
  })

  it('shows the requested count and size', () => {
    const text = formatter
      .ping('10.0.0.1', 'nas', { kind: 'reply', fromIp: '10.0.0.1', ttl: 128, baseTimeMs: 1 }, { count: 6, size: 1000 })
      .map((line) => line.text ?? '')
    expect(text[1]).toBe('Pinging nas [10.0.0.1] with 1000 bytes of data:')
    expect(text.filter((line) => line.startsWith('Reply from 10.0.0.1: bytes=1000 '))).toHaveLength(6)
    expect(text).toContain('    Packets: Sent = 6, Received = 6, Lost = 0 (0% loss),')
    expect(text).toContain('    Minimum = 1ms, Maximum = 3ms, Average = 2ms')
  })

  it('matches the statistics to the count for timeouts', () => {
    const text = formatter.ping('10.0.0.9', null, { kind: 'timeout' }, { count: 2, size: 0 }).map((line) => line.text ?? '')
    expect(text.filter((line) => line === 'Request timed out.')).toHaveLength(2)
    expect(text).toContain('    Packets: Sent = 2, Received = 0, Lost = 2 (100% loss),')
  })

  it('notes that continuous ping is not supported with an app message', () => {
    expect(formatter.continuousNotSupported()).toEqual({ kind: 'info', message: { key: 'engine:pingContinuousNotSupported' } })
  })

  it('notes that only the first requests are shown with an app message', () => {
    expect(formatter.countLimited(20)).toEqual({ kind: 'info', message: { key: 'engine:pingCountLimited', params: { count: 20 } } })
  })
})

describe('PingFormatter — TTL expired (routing loops)', () => {
  it('prints the router reply and counts it as received', () => {
    const text = formatter.ping('10.9.1.1', null, { kind: 'ttlExpired', fromIp: '10.0.12.2' }, { count: 2, size: 32 }).map((line) => line.text ?? '')
    expect(text).toEqual([
      '',
      'Pinging 10.9.1.1 with 32 bytes of data:',
      'Reply from 10.0.12.2: TTL expired in transit.',
      'Reply from 10.0.12.2: TTL expired in transit.',
      '',
      'Ping statistics for 10.9.1.1:',
      '    Packets: Sent = 2, Received = 2, Lost = 0 (0% loss),',
    ])
  })
})

describe('PingFormatter — per echo (simulator)', () => {
  it('prints equal echoes exactly like ping', () => {
    const reply = { kind: 'reply', fromIp: '10.0.0.2', ttl: 128, baseTimeMs: 1 } as const
    expect(formatter.pingEchoes('10.0.0.2', null, [reply, reply, reply, reply], 32)).toEqual(formatter.ping('10.0.0.2', null, reply, standard))
  })

  it('counts errors as received and times only the replies', () => {
    const lines = formatter
      .pingEchoes('10.0.0.2', null, [{ kind: 'timeout' }, { kind: 'reply', fromIp: '10.0.0.2', ttl: 128, baseTimeMs: 1 }, { kind: 'unreachable', fromIp: '10.0.0.1' }], 32)
      .map((line) => line.text ?? '')
    expect(lines.slice(2, 5)).toEqual(['Request timed out.', 'Reply from 10.0.0.2: bytes=32 time=2ms TTL=128', 'Reply from 10.0.0.1: Destination host unreachable.'])
    expect(lines.slice(-3)).toEqual([
      '    Packets: Sent = 3, Received = 2, Lost = 1 (33% loss),',
      'Approximate round trip times in milli-seconds:',
      '    Minimum = 2ms, Maximum = 2ms, Average = 2ms',
    ])
  })
})