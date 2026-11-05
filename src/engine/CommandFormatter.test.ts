import { describe, expect, it } from 'vitest'
import { CommandFormatter } from './CommandFormatter'

const formatter = new CommandFormatter()

describe('CommandFormatter', () => {
  it('aligns every ipconfig field on the same colon column', () => {
    const lines = formatter
      .ipconfig(
        {
          hostName: 'PC1',
          wireless: false,
          connected: true,
          mac: 'AA:BB:CC:DD:EE:FF',
          host: { mode: 'dhcp', ip: '192.168.1.5', mask: '255.255.255.0', gateway: '192.168.1.1', dns: ['192.168.1.1'] },
        },
        true,
      )
      .map((line) => line.text ?? '')
      .filter((text) => text.includes(' : '))
    expect(lines.length).toBeGreaterThan(5)
    for (const text of lines) expect(text.indexOf(' : ')).toBe(36)
    expect(lines).toContain('   Connection-specific DNS Suffix  . : ')
    expect(lines).toContain('   Physical Address. . . . . . . . . : AA-BB-CC-DD-EE-FF')
  })

  it('formats a successful ping with statistics', () => {
    const text = formatter
      .ping('8.8.8.8', null, { kind: 'reply', fromIp: '8.8.8.8', ttl: 117, baseTimeMs: 14 })
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
    const text = formatter.ping('192.168.1.9', null, { kind: 'unreachable', fromIp: '192.168.1.20' }).map((line) => line.text)
    expect(text).toContain('    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),')
    expect(text).not.toContain('Approximate round trip times in milli-seconds:')
  })
})
