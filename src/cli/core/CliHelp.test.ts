import { describe, expect, it } from 'vitest'
import { CliDriver, testRouter, testSwitch } from './testCli'

describe('CLI help and completion', () => {
  it('lists the commands of a mode with a header', () => {
    const cli = new CliDriver(testRouter())
    const lines = cli.help('')
    expect(lines[0]).toBe('Exec commands:')
    expect(lines).toContain('  enable    Turn on privileged commands')
    expect(cli.last.keepInput).toBe('')
    expect(cli.prompt).toBe('Router>')
  })

  it('lists next words with <cr> when the command is complete', () => {
    const cli = new CliDriver(testRouter())
    cli.typeAll('enable')
    expect(cli.help('configure ')).toEqual(['  terminal  Configure from the terminal', '  <cr>'])
    expect(cli.help('write ')).toEqual(['  erase   Erase NV memory', '  memory  Write to NV memory', '  <cr>'])
  })

  it('completes a partial word into a list (word?)', () => {
    const cli = new CliDriver(testRouter())
    cli.type('enable')
    expect(cli.help('co')).toEqual(['configure  copy  '])
    expect(cli.last.keepInput).toBe('co')
    expect(cli.help('xyz')).toEqual(['% Unrecognized command'])
  })

  it('shows parameter labels and interface types', () => {
    const cli = new CliDriver(testSwitch())
    cli.typeAll('enable', 'conf t')
    expect(cli.help('hostname ')).toEqual(["  WORD  This system's network name"])
    expect(cli.help('interface ')).toEqual([
      '  FastEthernet     FastEthernet IEEE 802.3',
      '  GigabitEthernet  GigabitEthernet IEEE 802.3z',
      '  Vlan             Catalyst Vlans',
      '  range            interface range command',
    ])
    expect(cli.help('interface fastEthernet ')).toEqual(['  <0-9>  FastEthernet interface number'])
    expect(cli.help('line vty ')).toEqual(['  <0-15>  First Line number'])
  })

  it('lists `no` forms and `do` in config mode', () => {
    const cli = new CliDriver(testRouter())
    cli.typeAll('enable', 'conf t')
    const lines = cli.help('')
    expect(lines[0]).toBe('Configure commands:')
    expect(lines.some((line) => line.startsWith('  no '))).toBe(true)
    expect(lines.some((line) => line.startsWith('  do '))).toBe(true)
    expect(cli.help('no ').some((line) => /^ {2}hostname +Set system's network name$/.test(line))).toBe(true)
    expect(cli.help('do ').some((line) => /^ {2}copy +Copy from one file to another$/.test(line))).toBe(true)
  })

  it('reports errors with a caret inside help', () => {
    const cli = new CliDriver(testRouter())
    cli.type('enable')
    expect(cli.help('shw ')).toEqual(['       ^', "% Invalid input detected at '^' marker.", ''])
  })

  it('completes words with Tab', () => {
    const cli = new CliDriver(testRouter())
    const { shell } = cli
    expect(shell.complete(cli.state, cli.device, 'en')).toBe('enable ')
    cli.type('enable')
    expect(shell.complete(cli.state, cli.device, 'conf')).toBe('configure ')
    expect(shell.complete(cli.state, cli.device, 'co')).toBe('co')
    expect(shell.complete(cli.state, cli.device, 'configure t')).toBe('configure terminal ')
    cli.type('conf t')
    expect(shell.complete(cli.state, cli.device, 'interface gi')).toBe('interface GigabitEthernet')
    expect(shell.complete(cli.state, cli.device, 'hostname ')).toBe('hostname ')
  })
})
