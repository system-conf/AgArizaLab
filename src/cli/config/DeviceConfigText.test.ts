import { describe, expect, it } from 'vitest'
import { CliShell } from '../core/CliShell'
import { catalogDevice } from '../core/testCli'
import { sampleL3Switch, samplePc, sampleRouter, sampleServer, sampleSwitch, withVlans } from './configFixtures'
import { DeviceConfigText } from './DeviceConfigText'

const text = new DeviceConfigText(new CliShell([]))

/** `interface <name>` + '!' for interfaces without any line. */
function blankInterfaces(prefix: string, from: number, to: number): string[] {
  const lines: string[] = []
  for (let number = from; number <= to; number += 1) lines.push(`interface ${prefix}${number}`, '!')
  return lines
}

describe('device config text: CLI devices (core command set)', () => {
  it('exports a router running-config', () => {
    expect(text.lines(sampleRouter())).toEqual([
      '!',
      'version 15.1',
      'no service timestamps log datetime msec',
      'no service timestamps debug datetime msec',
      'service password-encryption',
      '!',
      'hostname R1',
      '!',
      'enable secret 5 $1$WpwD$mHmStDBUM41UsC1Uc8/Uc.',
      '!',
      'interface GigabitEthernet0/0',
      ' description LAN',
      ' duplex auto',
      ' speed auto',
      '!',
      'interface GigabitEthernet0/1',
      ' duplex auto',
      ' speed auto',
      ' shutdown',
      '!',
      'interface Serial0/0/0',
      ' shutdown',
      '!',
      'interface Serial0/0/1',
      ' shutdown',
      '!',
      'banner motd ^CAuthorized only^C',
      '!',
      'line con 0',
      ' password 7 094F471A1A0A',
      ' logging synchronous',
      ' login',
      '!',
      'line aux 0',
      '!',
      'line vty 0 4',
      ' exec-timeout 5 0',
      ' password 7 03124F12',
      ' login',
      '!',
      'end',
    ])
  })

  it('puts the VLAN database before a switch running-config', () => {
    const device = withVlans(sampleSwitch(), [
      { id: 20, name: 'VLAN0020' },
      { id: 10, name: 'SALES' },
    ])
    expect(text.lines(device)).toEqual([
      '! VLAN database (vlan.dat, not part of running-config)',
      '!',
      'vlan 10',
      ' name SALES',
      '!',
      'vlan 20',
      '!',
      'version 12.2',
      'no service timestamps log datetime msec',
      'no service timestamps debug datetime msec',
      'no service password-encryption',
      '!',
      'hostname S1',
      '!',
      'enable password cisco',
      '!',
      'no ip domain-lookup',
      '!',
      'interface FastEthernet0/1',
      ' description PC1',
      ' duplex full',
      ' speed 100',
      '!',
      'interface FastEthernet0/2',
      ' shutdown',
      '!',
      ...blankInterfaces('FastEthernet0/', 3, 24),
      ...blankInterfaces('GigabitEthernet0/', 1, 2),
      'interface Vlan1',
      ' shutdown',
      '!',
      'line con 0',
      '!',
      'line vty 0 4',
      ' login',
      'line vty 5 15',
      ' login',
      '!',
      'end',
    ])
  })

  it('exports an L3 switch with its SVI and a multi-line banner', () => {
    const lines = text.lines(sampleL3Switch())
    expect(lines.slice(0, 7)).toEqual([
      '!',
      'version 12.2',
      'no service timestamps log datetime msec',
      'no service timestamps debug datetime msec',
      'no service password-encryption',
      '!',
      'hostname MS1',
    ])
    expect(lines.slice(lines.indexOf('interface GigabitEthernet1/1/1'))).toEqual([
      'interface GigabitEthernet1/1/1',
      ' description Uplink',
      '!',
      ...blankInterfaces('GigabitEthernet1/1/', 2, 4),
      'interface Vlan1',
      ' description Management',
      '!',
      'banner motd ^C',
      'Core switch',
      'Authorized staff only',
      '^C',
      '!',
      'line con 0',
      '!',
      'line vty 0 4',
      ' login',
      'line vty 5 15',
      ' login',
      '!',
      'end',
    ])
  })

  it('has no VLAN block when only the fixed VLANs exist', () => {
    expect(DeviceConfigText.vlanDatabase(sampleSwitch())).toEqual([])
    expect(DeviceConfigText.vlanDatabase(sampleRouter())).toEqual([])
  })
})

describe('device config text: devices without a CLI', () => {
  it('summarises an end device', () => {
    expect(text.lines(samplePc())).toEqual([
      '! No command line: settings from the Config panel',
      '! eth0: 192.168.1.10 255.255.255.0',
      '! Default gateway: 192.168.1.1',
      '! DNS servers: 192.168.1.2, 8.8.8.8',
    ])
  })

  it('summarises the services of a server', () => {
    expect(text.lines(sampleServer())).toEqual([
      '! No command line: settings from the Config panel',
      '! eth0: 192.168.1.2 255.255.255.0',
      '! eth1: DHCP (no lease)',
      '! Default gateway: 192.168.1.1',
      '! DNS servers: 127.0.0.1',
      '! DHCP server: on',
      '!  pool LAN: network 192.168.1.0 255.255.255.0, range 192.168.1.100 - 192.168.1.199, default-router 192.168.1.1, dns-server 192.168.1.2',
      '!  excluded 192.168.1.150',
      '! DNS server: on',
      '!  forwarders 8.8.8.8',
      '!  A intranet.local 192.168.1.2',
    ])
  })

  it('summarises a home router and an access point, and has nothing for a hub', () => {
    expect(text.lines(catalogDevice('wirelessRouter', 'wr1', '00:D0:BA:00:00:30'))).toEqual([
      '! No command line: settings from the Config panel',
      '! WAN: DHCP (no lease)',
      '! Vlan1: 192.168.0.1 255.255.255.0',
      '! Static route: 0.0.0.0 0.0.0.0 WAN 254',
      '! SSID Default: VLAN 1, open',
      '! DHCP server: on',
      '!  pool lan: network 192.168.0.0 255.255.255.0, range 192.168.0.100 - 192.168.0.149, default-router 192.168.0.1, dns-server 192.168.0.1',
      '! DNS server: on',
      '!  forwarders 8.8.8.8',
    ])
    expect(text.lines(catalogDevice('accessPoint', 'ap1', '00:D0:BA:00:00:31'))).toEqual([
      '! No command line: settings from the Config panel',
      '! SSID Default: VLAN 1, open',
    ])
    expect(text.lines(catalogDevice('hub8', 'hub1', '00:D0:BA:00:00:32'))).toEqual(['! No configuration'])
  })
})
