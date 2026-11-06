import { describe, expect, it } from 'vitest'
import type { Device } from '../../domain'
import { catalogDevice, testSwitch } from '../core/testCli'
import { golden, SwitchTranscript } from './testSwitchLab'

function sviOf(device: Device, vlan: number) {
  return device.switching?.svis.find((svi) => svi.vlan === vlan)
}

describe('switch CLI: SVI addressing', () => {
  it('sets the management address of interface vlan 1', () => {
    const lab = new SwitchTranscript(testSwitch())
    lab.typeAll('enable', 'conf t')
    const transcript = golden(`
      Switch(config)#interface vlan 1
      Switch(config-if)#ip address 192.168.1.2 255.255.255.0
      Switch(config-if)#no shutdown
      %LINK-5-CHANGED: Interface Vlan1, changed state to up
      %LINEPROTO-5-UPDOWN: Line protocol on Interface Vlan1, changed state to up
      Switch(config-if)#exit
      Switch(config)#ip default-gateway 192.168.1.1
      Switch(config)#
    `)
    expect(lab.run(transcript)).toBe(transcript)
    expect(sviOf(lab.device, 1)).toEqual({ vlan: 1, adminUp: true, l3: { ipv4: { addressing: 'static', address: '192.168.1.2', mask: '255.255.255.0' } } })
    expect(lab.device.switching?.defaultGateway).toBe('192.168.1.1')
    lab.typeAll('no ip default-gateway')
    expect(lab.device.switching?.defaultGateway).toBe('')
  })

  it('refuses bad masks, network addresses and overlapping subnets', () => {
    const lab = new SwitchTranscript(testSwitch())
    lab.typeAll('enable', 'conf t', 'int vlan 1', 'ip address 10.0.0.2 255.255.255.0', 'exit')
    const transcript = golden(`
      Switch(config)#interface vlan 10
      %LINK-5-CHANGED: Interface Vlan10, changed state to up
      Switch(config-if)#ip address 10.1.0.1 255.0.255.0
      Bad mask 0xFF00FF00 for address 10.1.0.1
      Switch(config-if)#ip address 10.1.0.0 255.255.255.0
      Bad mask /24 for address 10.1.0.0
      Switch(config-if)#ip address 10.0.0.9 255.255.0.0
      % 10.0.0.0 overlaps with Vlan1
      Switch(config-if)#ip address 10.1.0.1 255.255.255.0
      Switch(config-if)#
    `)
    expect(lab.run(transcript)).toBe(transcript)
    expect(sviOf(lab.device, 10)?.l3.ipv4).toEqual({ addressing: 'static', address: '10.1.0.1', mask: '255.255.255.0' })
  })

  it('takes the address from DHCP and removes it with no ip address', () => {
    const lab = new SwitchTranscript(testSwitch())
    lab.typeAll('enable', 'conf t', 'int vlan 1', 'ip address dhcp')
    expect(sviOf(lab.device, 1)?.l3.ipv4).toEqual({ addressing: 'dhcp', address: '', mask: '' })
    lab.typeAll('ip address 172.16.0.2 255.255.0.0', 'no ip address')
    expect(sviOf(lab.device, 1)?.l3.ipv4).toEqual({ addressing: 'static', address: '', mask: '' })
  })

  it('refuses an address on a switchport', () => {
    const lab = new SwitchTranscript(testSwitch())
    lab.typeAll('enable', 'conf t')
    const transcript = golden(`
      Switch(config)#interface fa0/1
      Switch(config-if)#ip address 10.0.0.1 255.0.0.0
      % IP addresses may not be configured on L2 links.
      Switch(config-if)#
    `)
    expect(lab.run(transcript)).toBe(transcript)
  })

  it('addresses a routed port of an L3 switch', () => {
    const lab = new SwitchTranscript(catalogDevice('l3Switch24', 'd1', '00:D0:BA:00:00:03'))
    lab.typeAll('enable', 'conf t', 'int gi1/0/24', 'no switchport', 'ip address 10.9.9.1 255.255.255.252')
    const port = lab.device.ports.find((candidate) => candidate.id === 'Gi1/0/24')
    expect(port?.role === 'routed' ? port.l3.ipv4 : null).toEqual({ addressing: 'static', address: '10.9.9.1', mask: '255.255.255.252' })
  })
})
