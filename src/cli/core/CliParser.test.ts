import { describe, expect, it } from 'vitest'
import type { CliCommandSet } from '../contract'
import { CliDriver, testRouter, testSwitch } from './testCli'
import { keyword, param } from './CliNodes'
import { cliText } from './CliOutput'

/** A tiny set that echoes what it parsed, to test the parser through the shell. */
const echoSet: CliCommandSet = {
  id: 'echo',
  commands: [
    {
      modes: ['privilegedExec'],
      node: keyword('show', 'Show running system information', {
        children: [
          keyword('ip', 'IP information', {
            children: [
              keyword('interface', 'IP interface status and configuration', {
                children: [keyword('brief', 'Brief summary of IP status and configuration', { run: (ctx) => ({ lines: cliText(ctx.path.join(' ')) }) })],
              }),
              keyword('route', 'IP routing table', { run: (ctx) => ({ lines: cliText(ctx.path.join(' ')) }) }),
            ],
          }),
          keyword('interfaces', 'Interface status and configuration', { run: () => ({ lines: cliText('interfaces') }) }),
        ],
      }),
    },
    {
      modes: ['globalConfig'],
      node: keyword('ip', 'Global IP configuration subcommands', {
        children: [
          keyword('route', 'Establish static routes', {
            children: [
              param('prefix', { type: 'ipv4' }, 'Destination prefix', {
                children: [
                  param('mask', { type: 'ipv4' }, 'Destination prefix mask', {
                    children: [
                      param('nextHop', { type: 'ipv4' }, 'Forwarding router\'s address', {
                        run: (ctx) => ({ lines: cliText(`route ${ctx.args.text('prefix')} ${ctx.args.text('mask')} ${ctx.args.text('nextHop')}`) }),
                        runNo: (ctx) => ({ lines: cliText(`no route ${ctx.args.text('prefix')}`) }),
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    },
    {
      modes: ['interface'],
      node: keyword('switchport', 'Set switching mode characteristics', {
        children: [
          keyword('access', 'Set access mode characteristics of the interface', {
            children: [
              keyword('vlan', 'Set VLAN when interface is in access mode', {
                children: [param('vlan', { type: 'number', min: 1, max: 4094 }, 'VLAN ID of the VLAN when this port is in access mode', {
                  run: (ctx) => ({ lines: cliText(`${ctx.mode.kind === 'interface' ? ctx.mode.interfaceId : '?'} vlan ${ctx.args.number('vlan')}`) }),
                })],
              }),
            ],
          }),
        ],
      }),
    },
  ],
}

describe('CLI parser', () => {
  it('accepts unambiguous abbreviations', () => {
    const cli = new CliDriver(testRouter(), [echoSet])
    cli.type('en')
    expect(cli.type('sh ip int br')).toEqual(['show ip interface brief'])
    expect(cli.type('SH IP RO')).toEqual(['show ip route'])
    cli.type('conf t')
    expect(cli.prompt).toBe('Router(config)#')
  })

  it('reports ambiguous, incomplete and invalid input like IOS', () => {
    const cli = new CliDriver(testRouter(), [echoSet])
    cli.type('enable')
    expect(cli.type('sh i')).toEqual(['% Ambiguous command:  "sh i"', ''])
    expect(cli.type('show ip')).toEqual(['% Incomplete command.', ''])
    // 'Router#' is 7 characters; 'show ip rote' has the bad word at column 8.
    expect(cli.type('show ip rote')).toEqual(['               ^', "% Invalid input detected at '^' marker.", ''])
  })

  it('places the caret on a bad parameter value', () => {
    const cli = new CliDriver(testRouter(), [echoSet])
    cli.typeAll('enable', 'configure terminal')
    // 'Router(config)#' = 15 characters, '10.0.0.300' starts at index 9.
    expect(cli.type('ip route 10.0.0.300 255.0.0.0 1.1.1.1')).toEqual([`${' '.repeat(24)}^`, "% Invalid input detected at '^' marker.", ''])
    expect(cli.type('ip route 10.0.0.0 255.0.0.0 1.1.1.1')).toEqual(['route 10.0.0.0 255.0.0.0 1.1.1.1'])
  })

  it('offers `no` forms and `do` in config modes', () => {
    const cli = new CliDriver(testRouter(), [echoSet])
    cli.typeAll('enable', 'conf t')
    expect(cli.type('no ip route 10.0.0.0 255.0.0.0 1.1.1.1')).toEqual(['no route 10.0.0.0'])
    expect(cli.type('no')).toEqual(['% Incomplete command.', ''])
    expect(cli.type('do sh ip ro')).toEqual(['show ip route'])
    expect(cli.prompt).toBe('Router(config)#')
  })

  it('treats an unknown single word in EXEC as a host name', () => {
    const cli = new CliDriver(testRouter())
    expect(cli.type('hello')).toEqual([
      'Translating "hello"...domain server (255.255.255.255)',
      '% Unknown command or computer name, or unable to find computer address',
    ])
  })

  it('runs global commands from a sub-mode and leaves the sub-mode', () => {
    const cli = new CliDriver(testRouter(), [echoSet])
    cli.typeAll('enable', 'conf t', 'interface g0/0')
    expect(cli.prompt).toBe('Router(config-if)#')
    cli.type('hostname R1')
    expect(cli.prompt).toBe('R1(config)#')
  })

  it('parses interface names in one or two words', () => {
    const cli = new CliDriver(testSwitch(), [echoSet])
    cli.typeAll('enable', 'conf t')
    cli.type('interface fastEthernet 0/3')
    expect(cli.type('switchport access vlan 10')).toEqual(['Fa0/3 vlan 10'])
    cli.type('int fa0/4')
    expect(cli.type('sw a v 20')).toEqual(['Fa0/4 vlan 20'])
  })

  it('runs interface-range commands once per member', () => {
    const cli = new CliDriver(testSwitch(), [echoSet])
    cli.typeAll('enable', 'conf t', 'interface range fa0/1 - 3 , fa0/7')
    expect(cli.prompt).toBe('Switch(config-if-range)#')
    expect(cli.type('switchport access vlan 30')).toEqual(['Fa0/1 vlan 30', 'Fa0/2 vlan 30', 'Fa0/3 vlan 30', 'Fa0/7 vlan 30'])
  })

  it('refuses interface types the device does not have', () => {
    const cli = new CliDriver(testRouter())
    cli.typeAll('enable', 'conf t')
    expect(cli.type('interface fa0/1')).toEqual([`${' '.repeat(25)}^`, "% Invalid input detected at '^' marker.", ''])
    expect(cli.type('interface g0/7')).toEqual(['%Invalid interface type and number'])
  })
})
