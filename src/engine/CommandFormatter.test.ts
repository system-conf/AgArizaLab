import { describe, expect, it } from 'vitest'
import type { TerminalLine } from '../domain/EngineContract'
import { type AdapterView, CommandFormatter } from './CommandFormatter'

const formatter = new CommandFormatter()

const view: AdapterView = {
  hostName: 'PC1',
  wireless: false,
  connected: true,
  mac: 'AA:BB:CC:DD:EE:FF',
  host: { mode: 'dhcp', ip: '192.168.1.5', mask: '255.255.255.0', gateway: '192.168.1.1', dns: ['192.168.1.1'] },
  duplicateAddress: false,
}

function texts(lines: TerminalLine[]): string[] {
  return lines.map((line) => line.text ?? '')
}

describe('CommandFormatter — ipconfig', () => {
  it('aligns every ipconfig field on the same colon column', () => {
    const lines = texts(formatter.ipconfig(view, true)).filter((text) => text.includes(' : '))
    expect(lines.length).toBeGreaterThan(5)
    for (const text of lines) expect(text.indexOf(' : ')).toBe(36)
    expect(lines).toContain('   Connection-specific DNS Suffix  . : ')
    expect(lines).toContain('   Physical Address. . . . . . . . . : AA-BB-CC-DD-EE-FF')
  })

  it('marks a duplicate address and falls back to APIPA', () => {
    const lines = texts(formatter.ipconfig({ ...view, duplicateAddress: true }, true))
    expect(lines).toContain('   IPv4 Address. . . . . . . . . . . : 192.168.1.5(Duplicate)')
    expect(lines).toContain('   Autoconfiguration IPv4 Address. . : 169.254.238.254(Preferred)')
    expect(lines).toContain('   Subnet Mask . . . . . . . . . . . : 255.255.0.0')
    expect(lines).toContain('   Default Gateway . . . . . . . . . : 192.168.1.1')
    const plain = texts(formatter.ipconfig({ ...view, duplicateAddress: true }, false))
    expect(plain).toContain('   IPv4 Address. . . . . . . . . . . : 192.168.1.5(Duplicate)')
    expect(plain).toContain('   Autoconfiguration IPv4 Address. . : 169.254.238.254')
  })

  it('prints a released adapter without an IPv4 address', () => {
    expect(texts(formatter.released({ ...view, wireless: true }))).toEqual([
      '',
      'Windows IP Configuration',
      '',
      'Wireless LAN adapter Wi-Fi:',
      '',
      '   Connection-specific DNS Suffix  . : ',
      '   Default Gateway . . . . . . . . . : ',
    ])
  })

  it('uses the Windows wording for refused DHCP operations', () => {
    expect(texts(formatter.mediaDisconnected(false))).toContain(
      'No operation can be performed on Ethernet while it has its media disconnected.',
    )
    expect(texts(formatter.dhcpNotPermitted())).toContain(
      'The operation failed as no adapter is in the state permissible for this operation.',
    )
  })
})

describe('CommandFormatter — app messages', () => {
  it('returns help as translated message lines only', () => {
    const lines = formatter.help()
    expect(lines[0]).toEqual({ kind: 'info', message: { key: 'engine:help.title' } })
    expect(lines.every((line) => line.message !== undefined && line.text === undefined)).toBe(true)
    expect(lines.map((line) => line.message?.key)).toEqual(
      expect.arrayContaining(['engine:help.ipconfigRelease', 'engine:help.tracert', 'engine:help.pingCount']),
    )
  })

  it('prints the cmd.exe error for an unknown command, then a translated hint', () => {
    expect(formatter.unknownCommand('foo')).toEqual([
      { kind: 'error', text: "'foo' is not recognized as an internal or external command," },
      { kind: 'error', text: 'operable program or batch file.' },
      { kind: 'info', message: { key: 'engine:unknownCommand', params: { command: 'foo' } } },
    ])
  })

  it('returns device state problems as messages', () => {
    expect(formatter.devicePoweredOff()).toEqual([{ kind: 'error', message: { key: 'engine:devicePoweredOff' } }])
    expect(formatter.noTerminal()).toEqual([{ kind: 'error', message: { key: 'engine:noTerminal' } }])
    expect(formatter.usage('nslookup')).toEqual([{ kind: 'error', message: { key: 'engine:usage.nslookup' } }])
  })

  it('formats option errors with the Windows wording', () => {
    const usage = { kind: 'error', message: { key: 'engine:usage.ping' } }
    expect(formatter.optionError({ kind: 'badOption', option: '-x' }, 'ping')).toEqual([
      { kind: 'error', text: 'Bad option -x.' },
      usage,
    ])
    expect(formatter.optionError({ kind: 'missingValue', option: '-n' }, 'ping')).toEqual([
      { kind: 'error', text: 'Value must be supplied for option -n.' },
      usage,
    ])
    expect(formatter.optionError({ kind: 'badValue', option: '-l', min: 0, max: 65500 }, 'ping')).toEqual([
      { kind: 'error', text: 'Bad value for option -l, valid range is from 0 to 65500.' },
    ])
    expect(formatter.optionError({ kind: 'badParameter', value: '1.1.1.1' }, 'ping')).toEqual([
      { kind: 'error', text: 'Bad parameter 1.1.1.1.' },
    ])
    expect(formatter.optionError({ kind: 'missingTarget' }, 'tracert')).toEqual([
      { kind: 'error', message: { key: 'engine:usage.tracert' } },
    ])
  })
})
