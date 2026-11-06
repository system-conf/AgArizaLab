import { describe, expect, it } from 'vitest'
import type { L3Settings } from '../../domain'
import { DeviceInterfaces } from '../core/DeviceInterfaces'
import { RouterCli, testL3Switch } from './testRouterCli'

const SUBIF_WITHOUT_VLAN = [
  '% Configuring IP routing on a LAN subinterface is only allowed if that',
  'subinterface is already configured as part of an IEEE 802.10, IEEE 802.1Q,',
  'or ISL vLAN.',
]

function l3Of(cli: RouterCli, id: string): L3Settings {
  const iface = DeviceInterfaces.find(cli.device, id)
  if (iface?.kind === 'port' && iface.port.role === 'routed') return iface.port.l3
  if (iface?.kind === 'subInterface') return iface.sub.l3
  if (iface?.kind === 'svi') return iface.svi.l3
  throw new Error(`no L3 interface ${id}`)
}

describe('router CLI: ip address', () => {
  it('sets and removes a static address', () => {
    const cli = new RouterCli()
    expect(cli.configure('interface g0/0', 'ip address 192.168.1.1 255.255.255.0')).toEqual([])
    expect(l3Of(cli, 'Gi0/0').ipv4).toEqual({ addressing: 'static', address: '192.168.1.1', mask: '255.255.255.0' })
    expect(cli.type('no ip address')).toEqual([])
    expect(l3Of(cli, 'Gi0/0').ipv4).toEqual({ addressing: 'static', address: '', mask: '' })
  })

  it('takes the address from DHCP with ip address dhcp', () => {
    const cli = new RouterCli()
    cli.configure('int g0/1', 'ip address dhcp')
    expect(l3Of(cli, 'Gi0/1').ipv4).toEqual({ addressing: 'dhcp', address: '', mask: '' })
    expect(cli.config()).toContain(' ip address dhcp')
  })

  it('rejects bad masks, network addresses and overlapping subnets with the IOS text', () => {
    const cli = new RouterCli()
    cli.configure('int g0/0', 'ip address 192.168.1.1 255.255.255.0', 'int g0/1')
    expect(cli.type('ip address 10.0.0.1 255.0.255.0')).toEqual(['Bad mask 0xFF00FF00 for address 10.0.0.1'])
    expect(cli.type('ip address 10.0.0.0 255.255.255.0')).toEqual(['Bad mask /24 for address 10.0.0.0'])
    expect(cli.type('ip address 10.0.0.255 255.255.255.0')).toEqual(['Bad mask /24 for address 10.0.0.255'])
    expect(cli.type('ip address 192.168.1.5 255.255.255.0')).toEqual(['% 192.168.1.0 overlaps with GigabitEthernet0/0'])
    expect(cli.type('ip address 192.168.0.1 255.255.0.0')).toEqual(['% 192.168.0.0 overlaps with GigabitEthernet0/0'])
    expect(l3Of(cli, 'Gi0/1').ipv4.address).toBe('')
  })

  it('refuses addresses on switchports and accepts them on SVIs (L3 switch)', () => {
    const cli = new RouterCli(testL3Switch())
    expect(cli.configure('int g1/0/1', 'ip address 10.0.0.1 255.255.255.0')).toEqual(['% IP addresses may not be configured on L2 links.'])
    cli.typeAll('int vlan 10', 'ip address 10.10.0.1 255.255.255.0')
    expect(l3Of(cli, 'Vlan10').ipv4.address).toBe('10.10.0.1')
  })

  it('runs the interface commands once per member of an interface range', () => {
    const cli = new RouterCli(testL3Switch())
    cli.configure('int vlan 10', 'int vlan 20', 'interface range vlan 10 , vlan 20')
    expect(cli.prompt).toBe('Switch(config-if-range)#')
    expect(cli.type('ip helper-address 10.0.0.5')).toEqual([])
    expect(l3Of(cli, 'Vlan10').helperAddresses).toEqual(['10.0.0.5'])
    expect(l3Of(cli, 'Vlan20').helperAddresses).toEqual(['10.0.0.5'])
  })

  it('lists the interface ip commands with ?', () => {
    const cli = new RouterCli()
    cli.configure('int g0/0')
    expect(cli.help('ip ')).toEqual([
      '  address         Set the IP address of an interface',
      '  helper-address  Specify a destination address for UDP broadcasts',
    ])
    expect(cli.help('ip address ')).toEqual(['  A.B.C.D  IP address', '  dhcp     IP Address negotiated via DHCP'])
  })
})

describe('router CLI: sub-interfaces', () => {
  it('needs encapsulation dot1Q before an address, then creates the sub-interface', () => {
    const cli = new RouterCli()
    cli.configure('interface g0/0.10')
    expect(cli.prompt).toBe('Router(config-subif)#')
    expect(cli.type('ip address 10.10.0.1 255.255.255.0')).toEqual(SUBIF_WITHOUT_VLAN)
    expect(cli.type('encapsulation dot1Q 10')).toEqual([])
    expect(cli.type('ip address 10.10.0.1 255.255.255.0')).toEqual([])
    const iface = DeviceInterfaces.find(cli.device, 'Gi0/0.10')
    expect(iface?.kind === 'subInterface' ? iface.sub : null).toEqual({
      id: 'Gi0/0.10',
      vlan: 10,
      adminUp: true,
      l3: { ipv4: { addressing: 'static', address: '10.10.0.1', mask: '255.255.255.0' } },
    })
  })

  it('marks the native VLAN and refuses a VLAN used by another sub-interface', () => {
    const cli = new RouterCli()
    cli.configure('int g0/0.1', 'encapsulation dot1Q 1 native', 'int g0/0.20', 'encapsulation dot1Q 20')
    expect(cli.config()).toEqual(expect.arrayContaining([' encapsulation dot1Q 1 native', ' encapsulation dot1Q 20']))
    cli.type('int g0/0.30')
    expect(cli.type('encapsulation dot1Q 20')).toEqual([
      'Configuration of multiple subinterfaces of the same main interface with the same VID (20) is not permitted.',
      'This VID is already configured on GigabitEthernet0/0.20.',
    ])
    expect(DeviceInterfaces.find(cli.device, 'Gi0/0.30')).toBeUndefined()
  })

  it('removes a sub-interface with no interface', () => {
    const cli = new RouterCli()
    cli.configure('int g0/0.10', 'encapsulation dot1Q 10', 'exit', 'no interface g0/0.10')
    expect(DeviceInterfaces.find(cli.device, 'Gi0/0.10')).toBeUndefined()
  })
})

describe('router CLI: helper-address, clock rate, shutdown', () => {
  it('adds and removes DHCP relay targets', () => {
    const cli = new RouterCli()
    cli.configure('int g0/0', 'ip helper-address 10.0.0.5', 'ip helper-address 10.0.0.6', 'ip helper-address 10.0.0.5')
    expect(l3Of(cli, 'Gi0/0').helperAddresses).toEqual(['10.0.0.5', '10.0.0.6'])
    cli.type('no ip helper-address 10.0.0.5')
    expect(l3Of(cli, 'Gi0/0').helperAddresses).toEqual(['10.0.0.6'])
    cli.type('no ip helper-address')
    expect(l3Of(cli, 'Gi0/0').helperAddresses).toBeUndefined()
  })

  it('sets the clock rate on serial ports only', () => {
    const cli = new RouterCli()
    cli.configure('int s0/0/0', 'clock rate 64000')
    const port = cli.device.ports.find((candidate) => candidate.id === 'Se0/0/0')
    expect(port?.role === 'routed' ? port.serial : null).toEqual({ clockRate: 64000 })
    cli.type('no clock rate')
    const cleared = cli.device.ports.find((candidate) => candidate.id === 'Se0/0/0')
    expect(cleared?.role === 'routed' ? cleared.serial : null).toBeUndefined()
    cli.type('int g0/0')
    expect(cli.type('clock rate 64000')).toEqual([`${' '.repeat('Router(config-if)#'.length)}^`, "% Invalid input detected at '^' marker.", ''])
  })

  it('brings an interface up with no shutdown and sets a description (core commands)', () => {
    const cli = new RouterCli()
    cli.configure('int g0/0', 'description LAN')
    expect(cli.type('no shutdown')).toEqual(['%LINK-5-CHANGED: Interface GigabitEthernet0/0, changed state to down'])
    expect(cli.config()).toEqual(expect.arrayContaining(['interface GigabitEthernet0/0', ' description LAN', ' no ip address']))
  })
})
