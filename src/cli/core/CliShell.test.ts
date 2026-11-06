import { describe, expect, it } from 'vitest'
import type { CliCommandSet } from '../contract'
import { keyword } from './CliNodes'
import { cliText } from './CliOutput'
import { CliDriver, testRouter, testSwitch, textOf } from './testCli'

describe('CLI shell: modes and prompts', () => {
  it('walks every mode with the IOS prompts', () => {
    const cli = new CliDriver(testSwitch())
    expect(cli.prompt).toBe('Switch>')
    cli.type('enable')
    expect(cli.prompt).toBe('Switch#')
    expect(cli.type('configure terminal')).toEqual(['Enter configuration commands, one per line.  End with CNTL/Z.'])
    expect(cli.prompt).toBe('Switch(config)#')
    const prompts = [
      ['interface fa0/1', 'Switch(config-if)#'],
      ['interface range fa0/1 - 2', 'Switch(config-if-range)#'],
      ['line console 0', 'Switch(config-line)#'],
      ['line vty 0 15', 'Switch(config-line)#'],
      ['interface vlan 1', 'Switch(config-if)#'],
    ]
    for (const [line, prompt] of prompts) {
      cli.type(line ?? '')
      expect(cli.prompt).toBe(prompt)
      cli.type('exit')
      expect(cli.prompt).toBe('Switch(config)#')
    }
    expect(cli.type('end')).toEqual(['%SYS-5-CONFIG_I: Configured from console by console'])
    expect(cli.prompt).toBe('Switch#')
    cli.type('disable')
    expect(cli.prompt).toBe('Switch>')
  })

  it('enters the sub-interface mode on routers', () => {
    const cli = new CliDriver(testRouter())
    cli.typeAll('enable', 'conf t', 'interface g0/0.10')
    expect(cli.prompt).toBe('Router(config-subif)#')
    expect(cli.state.mode).toEqual({ kind: 'subInterface', interfaceId: 'Gi0/0.10' })
  })

  it('leaves config mode with Ctrl+Z and logs out with exit', () => {
    const cli = new CliDriver(testRouter())
    cli.typeAll('enable', 'conf t', 'int g0/0')
    expect(textOf(cli.take(cli.shell.control(cli.state, cli.device, 'ctrlZ')).map((text) => ({ kind: 'output' as const, text })))).toEqual([
      '%SYS-5-CONFIG_I: Configured from console by console',
    ])
    expect(cli.prompt).toBe('Router#')
    expect(cli.type('exit')).toContain('Press RETURN to get started.')
    expect(cli.last.input).toBe('pressReturn')
    cli.type('')
    expect(cli.prompt).toBe('Router>')
  })

  it('changes the prompt with hostname and restores the default with no hostname', () => {
    const cli = new CliDriver(testRouter())
    cli.typeAll('enable', 'conf t', 'hostname R1')
    expect(cli.prompt).toBe('R1(config)#')
    expect(cli.device.features?.management?.hostname).toBe('R1')
    expect(cli.type('hostname 1R')).toEqual(['% Hostname contains one or more illegal characters.'])
    cli.type('no hostname')
    expect(cli.prompt).toBe('Router(config)#')
  })

  it('never mutates the device it was given', () => {
    const original = testRouter()
    const snapshot = JSON.stringify(original)
    const cli = new CliDriver(original)
    cli.typeAll('enable', 'conf t', 'hostname R9', 'int g0/0', 'no shutdown', 'description uplink')
    expect(JSON.stringify(original)).toBe(snapshot)
    expect(cli.last.device).toBeDefined()
  })
})

describe('CLI shell: passwords', () => {
  it('asks the enable secret, three tries', () => {
    const cli = new CliDriver(testRouter())
    cli.typeAll('enable', 'conf t', 'enable secret class', 'end', 'disable', 'enable')
    expect(cli.prompt).toBe('Password: ')
    expect(cli.last.input).toBe('secret')
    cli.typeAll('wrong', 'wrong')
    expect(cli.type('wrong')).toEqual(['% Bad secrets', ''])
    expect(cli.prompt).toBe('Router>')
    cli.typeAll('enable', 'class')
    expect(cli.prompt).toBe('Router#')
  })

  it('asks the console password after logout when the line has login', () => {
    const cli = new CliDriver(testRouter())
    cli.typeAll('enable', 'conf t', 'banner motd #Authorized access only#', 'line con 0', 'password cisco', 'login', 'end', 'exit')
    expect(cli.type('')).toEqual(['Authorized access only', '', 'User Access Verification', ''])
    expect(cli.prompt).toBe('Password: ')
    cli.type('cisco')
    expect(cli.prompt).toBe('Router>')
  })

  it('shows passwords encrypted after service password-encryption', () => {
    const cli = new CliDriver(testSwitch())
    cli.typeAll('enable', 'conf t', 'enable password cisco', 'line vty 0 4', 'password telnet', 'exit', 'service password-encryption', 'end')
    const config = cli.shell.runningConfig(cli.device)
    expect(config).toContain('service password-encryption')
    expect(config.some((line) => /^enable password 7 [0-9A-F]+$/.test(line))).toBe(true)
    expect(config.some((line) => /^ password 7 [0-9A-F]+$/.test(line))).toBe(true)
    expect(config.join('\n')).not.toContain('telnet')
  })
})

describe('CLI shell: running-config and startup-config', () => {
  it('generates a running-config with interfaces and lines', () => {
    const cli = new CliDriver(testRouter())
    cli.typeAll('enable', 'conf t', 'hostname R1', 'no ip domain-lookup', 'int g0/0', 'description LAN', 'no shutdown', 'end')
    const shown = textOf(cli.shell.submit(cli.state, cli.device, cli.env, 'show running-config').lines)
    expect(shown.slice(0, 2)).toEqual(['Building configuration...', ''])
    expect(shown[2]).toMatch(/^Current configuration : \d+ bytes$/)
    const config = cli.shell.runningConfig(cli.device)
    expect(config.slice(0, 7)).toEqual([
      '!',
      'version 15.1',
      'no service timestamps log datetime msec',
      'no service timestamps debug datetime msec',
      'no service password-encryption',
      '!',
      'hostname R1',
    ])
    const text = config.join('\n')
    expect(text).toContain('no ip domain-lookup')
    expect(text).toContain('interface GigabitEthernet0/0\n description LAN\n duplex auto\n speed auto\n!')
    expect(text).toContain('interface GigabitEthernet0/1\n duplex auto\n speed auto\n shutdown\n!')
    expect(text).toContain('interface Serial0/0/0\n shutdown\n!')
    expect(text).toContain('line con 0\n!\nline aux 0\n!\nline vty 0 4\n login\n!\nend')
  })

  it('saves with write memory and reloads from startup-config', () => {
    const cli = new CliDriver(testRouter())
    cli.typeAll('enable', 'conf t', 'hostname R1', 'int g0/0', 'no shut', 'end')
    expect(cli.type('show startup-config')).toEqual(['startup-config is not present'])
    expect(cli.type('write memory')).toEqual(['Building configuration...', '[OK]'])
    cli.typeAll('conf t', 'hostname Other', 'int g0/0', 'shutdown', 'end')
    expect(cli.type('reload')).toEqual([])
    expect(cli.prompt).toBe('System configuration has been modified. Save? [yes/no]: ')
    cli.type('no')
    expect(cli.prompt).toBe('Proceed with reload? [confirm]')
    expect(cli.type('')).toContain('Press RETURN to get started!')
    expect(cli.last.reloaded).toBe(true)
    cli.type('')
    expect(cli.prompt).toBe('R1>')
    expect(cli.device.ports.find((port) => port.id === 'Gi0/0')?.adminUp).toBe(true)
    expect(cli.device.ports.find((port) => port.id === 'Gi0/1')?.adminUp).toBe(false)
  })

  it('copies running-config to startup-config after asking the file name', () => {
    const cli = new CliDriver(testSwitch())
    cli.typeAll('enable', 'terminal length 0', 'copy running-config startup-config')
    expect(cli.prompt).toBe('Destination filename [startup-config]? ')
    expect(cli.type('')).toEqual(['Building configuration...', '[OK]'])
    const shown = cli.type('show startup-config')
    expect(shown[0]).toMatch(/^Using \d+ bytes$/)
    expect(shown).toContain('hostname Switch')
    cli.typeAll('erase startup-config', '')
    expect(cli.type('show startup-config')).toEqual(['startup-config is not present'])
  })

  it('reads multi-line banners and replays them', () => {
    const cli = new CliDriver(testRouter())
    cli.typeAll('enable', 'conf t')
    expect(cli.type('banner motd #')).toEqual(["Enter TEXT message.  End with the character '#'."])
    cli.typeAll('Line one', 'Line two#')
    expect(cli.device.features?.management?.bannerMotd).toBe('Line one\nLine two')
    const text = cli.shell.runningConfig(cli.device).join('\n')
    expect(text).toContain('banner motd ^C\nLine one\nLine two\n^C')
    const replayed = cli.shell.replay(testRouter(), text)
    expect(replayed.features?.management?.bannerMotd).toBe('Line one\nLine two')
  })

  it('replays secrets and type 7 passwords', () => {
    const cli = new CliDriver(testRouter())
    cli.typeAll('enable', 'conf t', 'service password-encryption', 'enable secret s3cret', 'enable password p4ss', 'line con 0', 'password con', 'login', 'end')
    const replayed = cli.shell.replay(testRouter(), cli.shell.runningConfig(cli.device).join('\n'))
    expect(replayed.features?.management).toEqual(cli.device.features?.management)
  })
})

describe('CLI shell: interfaces, pager, history', () => {
  it('creates an SVI and logs link changes', () => {
    const cli = new CliDriver(testSwitch())
    cli.typeAll('enable', 'conf t')
    expect(cli.type('interface vlan 10')).toEqual(['%LINK-5-CHANGED: Interface Vlan10, changed state to up'])
    expect(cli.device.switching?.svis.map((svi) => svi.vlan)).toEqual([1, 10])
    expect(cli.type('shutdown')).toEqual(['%LINK-5-CHANGED: Interface Vlan10, changed state to administratively down'])
    cli.typeAll('exit', 'int fa0/1')
    expect(cli.type('no shutdown')).toEqual(['%LINK-5-CHANGED: Interface FastEthernet0/1, changed state to down'])
  })

  it('pages long output with --More--', () => {
    const long: CliCommandSet = {
      id: 'long',
      commands: [{ modes: ['privilegedExec'], node: keyword('long', 'Long output', { run: () => ({ lines: cliText(...Array.from({ length: 30 }, (_, i) => `line ${i + 1}`)) }) }) }],
    }
    const cli = new CliDriver(testRouter(), [long])
    cli.type('enable')
    expect(cli.type('long')).toHaveLength(23)
    expect(cli.prompt).toBe(' --More-- ')
    expect(cli.last.input).toBe('more')
    expect(textOf(cli.shell.pagerKey(cli.state, cli.device, 'enter').lines)).toEqual(['line 24'])
    cli.take(cli.shell.pagerKey(cli.state, cli.device, 'enter'))
    expect(textOf(cli.shell.pagerKey(cli.state, cli.device, 'space').lines)).toHaveLength(6)
    cli.take(cli.shell.pagerKey(cli.state, cli.device, 'space'))
    expect(cli.prompt).toBe('Router#')
    cli.type('terminal length 0')
    expect(cli.type('long')).toHaveLength(30)
  })

  it('keeps EXEC and config histories apart', () => {
    const cli = new CliDriver(testRouter())
    cli.typeAll('enable', 'conf t', 'hostname R1', 'end')
    expect(cli.type('show history')).toEqual(['  enable', '  conf t', '  show history'])
    cli.type('conf t')
    expect(cli.shell.history(cli.state)).toEqual(['hostname R1', 'end'])
  })

  it('says when the device is powered off', () => {
    const cli = new CliDriver({ ...testRouter(), powered: false })
    expect(cli.last.lines).toEqual([{ kind: 'info', message: { key: 'cli:poweredOff' } }])
  })
})
