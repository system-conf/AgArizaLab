import { describe, expect, it } from 'vitest'
import type { Device } from '../../domain'
import type { CliCommandResult, CliCommandSet } from '../contract'
import { keyword, param } from '../core/CliNodes'
import { cliText } from '../core/CliOutput'
import { CliShell } from '../core/CliShell'
import { FactoryReset } from '../core/FactoryReset'
import { PasswordEncoding } from '../core/PasswordEncoding'
import { catalogDevice, testSwitch } from '../core/testCli'
import { standaloneSwitchCommandSet, switchCommandSet } from './switchCommandSet'
import { golden, SwitchTranscript } from './testSwitchLab'

/** The configuration of the golden tests (a typical "VLANs + trunk + management" lab). */
const SWITCH_SETUP = [
  'enable',
  'configure terminal',
  'hostname S1',
  'enable secret class',
  'vlan 10',
  'name SALES',
  'vlan 99',
  'name MGMT',
  'exit',
  'interface range fa0/1 - 2',
  'switchport mode access',
  'switchport access vlan 10',
  'interface fa0/3',
  'description Printer',
  'switchport access vlan 10',
  'shutdown',
  'interface gi0/1',
  'switchport mode trunk',
  'switchport trunk native vlan 99',
  'switchport trunk allowed vlan 10,99',
  'interface vlan 99',
  'ip address 192.168.99.2 255.255.255.0',
  'exit',
  'ip default-gateway 192.168.99.1',
  'line console 0',
  'password cisco',
  'login',
  'line vty 0 15',
  'password telnet',
  'login',
  'end',
]

function configuredSwitch(): SwitchTranscript {
  const lab = new SwitchTranscript(testSwitch())
  lab.typeAll(...SWITCH_SETUP)
  return lab
}

/** What `reload` starts from, plus the VLAN database (vlan.dat survives a reload on IOS). */
function bootBase(device: Device): Device {
  const reset = FactoryReset.interfacesUp(FactoryReset.of(device))
  const switching = reset.switching
  return switching === undefined ? reset : { ...reset, switching: { ...switching, vlans: device.switching?.vlans ?? switching.vlans } }
}

function withoutStartup(device: Device): Device {
  const management = { ...device.features?.management }
  delete management.startupConfig
  return { ...device, features: { ...device.features, management } }
}

describe('switch CLI: running-config', () => {
  it('writes the switch sections in IOS order', () => {
    const lab = configuredSwitch()
    const plainPorts = Array.from({ length: 21 }, (_, index) => [`interface FastEthernet0/${index + 4}`, '!']).flat()
    expect(lab.shell.runningConfig(lab.device)).toEqual([
      '!',
      'version 12.2',
      'no service timestamps log datetime msec',
      'no service timestamps debug datetime msec',
      'no service password-encryption',
      '!',
      'hostname S1',
      '!',
      `enable secret 5 ${PasswordEncoding.secret5('class')}`,
      '!',
      'interface FastEthernet0/1',
      ' switchport access vlan 10',
      '!',
      'interface FastEthernet0/2',
      ' switchport access vlan 10',
      '!',
      'interface FastEthernet0/3',
      ' description Printer',
      ' switchport access vlan 10',
      ' shutdown',
      '!',
      ...plainPorts,
      'interface GigabitEthernet0/1',
      ' switchport trunk native vlan 99',
      ' switchport trunk allowed vlan 10,99',
      ' switchport mode trunk',
      '!',
      'interface GigabitEthernet0/2',
      '!',
      'interface Vlan1',
      ' no ip address',
      ' shutdown',
      '!',
      'interface Vlan99',
      ' ip address 192.168.99.2 255.255.255.0',
      '!',
      'ip default-gateway 192.168.99.1',
      '!',
      'line con 0',
      ' password cisco',
      ' login',
      '!',
      'line vty 0 4',
      ' password telnet',
      ' login',
      'line vty 5 15',
      ' password telnet',
      ' login',
      '!',
      'end',
    ])
  })

  it('replays its own running-config to the same device', () => {
    const lab = configuredSwitch()
    const text = lab.shell.runningConfig(lab.device).join('\n')
    expect(lab.shell.replay(bootBase(lab.device), text)).toEqual(lab.device)
  })

  it('round-trips an L3 switch: routed port, 802.1Q trunk, DHCP SVI, allowed none', () => {
    const lab = new SwitchTranscript(catalogDevice('l3Switch24', 'd1', '00:D0:BA:00:00:03'))
    lab.typeAll(
      'enable',
      'conf t',
      'hostname D1',
      'interface gi1/0/1',
      'no switchport',
      'ip address 10.0.0.1 255.255.255.252',
      'interface gi1/0/2',
      'switchport trunk encapsulation dot1q',
      'switchport mode trunk',
      'switchport trunk allowed vlan none',
      'interface gi1/0/3',
      'no switchport',
      'shutdown',
      'interface vlan 1',
      'ip address dhcp',
      'no shutdown',
      'end',
    )
    const config = lab.shell.runningConfig(lab.device)
    const text = config.join('\n')
    expect(text).toContain('interface GigabitEthernet1/0/1\n no switchport\n ip address 10.0.0.1 255.255.255.252\n!')
    expect(text).toContain(
      'interface GigabitEthernet1/0/2\n switchport trunk encapsulation dot1q\n switchport trunk allowed vlan none\n switchport mode trunk\n!',
    )
    expect(text).toContain('interface GigabitEthernet1/0/3\n no switchport\n no ip address\n shutdown\n!')
    expect(text).toContain('interface Vlan1\n ip address dhcp\n!')
    expect(lab.shell.replay(bootBase(lab.device), text)).toEqual(lab.device)
  })

  it('leaves ip address to the router set in switchCommandSet', () => {
    const lab = new SwitchTranscript(testSwitch(), { sets: [switchCommandSet] })
    lab.typeAll('enable', 'conf t', 'interface vlan 1')
    const transcript = golden(`
      Switch(config-if)#ip address 10.0.0.1 255.0.0.0
                           ^
      % Invalid input detected at '^' marker.

      Switch(config-if)#
    `)
    expect(lab.run(transcript)).toBe(transcript)
    expect(lab.shell.runningConfig(lab.device)).toContain('interface Vlan1')
    expect(lab.shell.runningConfig(lab.device)).not.toContain(' no ip address')
  })

  it('merges with a set that owns interface ip address (the router set)', () => {
    const run = (): CliCommandResult => ({ lines: cliText('router handler') })
    const address = keyword('address', 'Set the IP address of an interface', {
      runNo: run,
      children: [param('address', { type: 'ipv4' }, 'IP address', { children: [param('mask', { type: 'ipv4' }, 'IP subnet mask', { run })] })],
    })
    const routerLike: CliCommandSet = {
      id: 'routerLike',
      commands: [{ modes: ['interface', 'subInterface'], node: keyword('ip', 'Interface Internet Protocol config commands', { children: [address] }) }],
    }
    expect(() => new CliShell([standaloneSwitchCommandSet, routerLike])).toThrow(/two (run|runNo) handlers/)
    const lab = new SwitchTranscript(testSwitch(), { sets: [switchCommandSet, routerLike] })
    lab.typeAll('enable', 'conf t', 'interface vlan 1')
    expect(lab.run('Switch(config-if)#ip address 10.0.0.1 255.0.0.0\nrouter handler')).toBe('Switch(config-if)#ip address 10.0.0.1 255.0.0.0\nrouter handler')
    lab.typeAll('ip default-gateway 10.0.0.254')
    expect(lab.device.switching?.defaultGateway).toBe('10.0.0.254')
    expect(lab.last.prompt).toBe('Switch(config)#')
  })
})

describe('switch CLI: management', () => {
  it('asks the enable secret and keeps the hostname prompt', () => {
    const lab = configuredSwitch()
    const transcript = golden(`
      S1#disable
      S1>enable
      Password: wrong
      Password: class
      S1#show vlan brief
      VLAN Name                             Status    Ports
      ---- -------------------------------- --------- -------------------------------
      1    default                          active    Fa0/4, Fa0/5, Fa0/6, Fa0/7
                                                      Fa0/8, Fa0/9, Fa0/10, Fa0/11
                                                      Fa0/12, Fa0/13, Fa0/14, Fa0/15
                                                      Fa0/16, Fa0/17, Fa0/18, Fa0/19
                                                      Fa0/20, Fa0/21, Fa0/22, Fa0/23
                                                      Fa0/24, Gi0/2
      10   SALES                            active    Fa0/1, Fa0/2, Fa0/3
      99   MGMT                             active
      1002 fddi-default                     act/unsup
      1003 token-ring-default               act/unsup
      1004 fddinet-default                  act/unsup
      1005 trnet-default                    act/unsup
      S1#
    `)
    expect(lab.run(transcript)).toBe(transcript)
  })
})

describe('switch CLI: startup-config and reload', () => {
  it('saves with copy running-config startup-config and shows it', () => {
    const lab = configuredSwitch()
    const transcript = golden(`
      S1#show startup-config
      startup-config is not present
      S1#copy running-config startup-config
      Destination filename [startup-config]?
      Building configuration...
      [OK]
      S1#
    `)
    expect(lab.run(transcript)).toBe(transcript)
    const saved = lab.shell.runningConfig(lab.device)
    expect(lab.device.features?.management?.startupConfig).toBe(saved.join('\n'))
    lab.typeAll('terminal length 0')
    const shown = lab.shell.submit(lab.state, lab.device, lab.env, 'show startup-config').lines.map((line) => line.text)
    expect(shown).toEqual([`Using ${saved.reduce((total, line) => total + line.length + 1, 0)} bytes`, ...saved])
  })

  it('reloads to the saved configuration and drops unsaved changes', () => {
    const lab = configuredSwitch()
    lab.typeAll('write memory', 'configure terminal', 'hostname Changed', 'interface fa0/1', 'switchport access vlan 1', 'end')
    const transcript = golden(`
      Changed#reload
      System configuration has been modified. Save? [yes/no]: no
      Proceed with reload? [confirm]
      %SYS-5-RELOAD: Reload requested by console. Reload Reason: Reload Command.

      System Bootstrap, Version 12.2(25r)SEE4, RELEASE SOFTWARE (fc1)
      Copyright (c) 1986-2012 by cisco Systems, Inc.


      Press RETURN to get started!
    `)
    expect(lab.run(transcript)).toBe(transcript)
    expect(lab.last.reloaded).toBe(true)
    // RETURN (empty prompt and input), then the console login of the replayed `line con 0`.
    const afterReload = ['', '', 'User Access Verification', '', 'Password: cisco', 'S1>'].join('\n')
    expect(lab.run(afterReload)).toBe(afterReload)
    const fa01 = lab.device.ports.find((port) => port.id === 'Fa0/1')
    expect(fa01?.role === 'switched' ? fa01.l2.accessVlan : null).toBe(10)
    expect(lab.device.switching?.defaultGateway).toBe('192.168.99.1')
    expect(withoutStartup(lab.device).features?.management).toEqual(withoutStartup(configuredSwitch().device).features?.management)
  })
})
