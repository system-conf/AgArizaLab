import { describe, expect, it } from 'vitest'
import type { Device, Port } from '../../domain'
import { catalogDevice, testSwitch } from '../core/testCli'
import { cabledLab, golden, SwitchTranscript } from './testSwitchLab'

function portOf(device: Device, id: string): Port | undefined {
  return device.ports.find((port) => port.id === id)
}

function l2Of(device: Device, id: string) {
  const port = portOf(device, id)
  return port?.role === 'switched' ? port.l2 : undefined
}

function l3Switch(): Device {
  return catalogDevice('l3Switch24', 'd1', '00:D0:BA:00:00:03')
}

describe('switch CLI: switchport access', () => {
  it('sets access mode and VLAN, creating a missing VLAN', () => {
    const lab = new SwitchTranscript(testSwitch())
    lab.typeAll('enable', 'conf t')
    const transcript = golden(`
      Switch(config)#interface fa0/5
      Switch(config-if)#switchport mode access
      Switch(config-if)#switchport access vlan 30
      % Access VLAN does not exist. Creating vlan 30
      Switch(config-if)#
    `)
    expect(lab.run(transcript)).toBe(transcript)
    expect(l2Of(lab.device, 'Fa0/5')).toEqual({ mode: 'access', accessVlan: 30, nativeVlan: 1, allowedVlans: 'all' })
    expect(lab.device.switching?.vlans).toEqual([
      { id: 1, name: 'default' },
      { id: 30, name: 'VLAN0030' },
    ])
  })

  it('restores the factory access VLAN with no switchport access vlan', () => {
    const lab = new SwitchTranscript(testSwitch())
    lab.typeAll('enable', 'conf t', 'vlan 10', 'exit', 'int fa0/3', 'switchport access vlan 10')
    expect(l2Of(lab.device, 'Fa0/3')?.accessVlan).toBe(10)
    lab.typeAll('no switchport access vlan')
    expect(l2Of(lab.device, 'Fa0/3')?.accessVlan).toBe(1)
  })

  it('applies to every member of an interface range', () => {
    const lab = new SwitchTranscript(testSwitch())
    lab.typeAll('enable', 'conf t', 'vlan 20', 'exit', 'interface range fa0/1 - 4, fa0/10', 'switchport access vlan 20')
    const inVlan = lab.device.ports.filter((port) => port.role === 'switched' && port.l2.accessVlan === 20).map((port) => port.id)
    expect(inVlan).toEqual(['Fa0/1', 'Fa0/2', 'Fa0/3', 'Fa0/4', 'Fa0/10'])
  })
})

describe('switch CLI: switchport trunk', () => {
  it('makes a trunk with native and allowed VLANs', () => {
    const lab = new SwitchTranscript(testSwitch())
    lab.typeAll('enable', 'conf t')
    const transcript = golden(`
      Switch(config)#interface gi0/1
      Switch(config-if)#switchport mode trunk
      Switch(config-if)#switchport trunk native vlan 99
      Switch(config-if)#switchport trunk allowed vlan 10,20,30-35
      Switch(config-if)#
    `)
    expect(lab.run(transcript)).toBe(transcript)
    expect(l2Of(lab.device, 'Gi0/1')).toEqual({ mode: 'trunk', accessVlan: 1, nativeVlan: 99, allowedVlans: [10, 20, 30, 31, 32, 33, 34, 35] })
  })

  it('edits the allowed list with add, remove, except, none and all', () => {
    const lab = new SwitchTranscript(testSwitch())
    lab.typeAll('enable', 'conf t', 'int gi0/2', 'switchport mode trunk')
    const allowed = () => l2Of(lab.device, 'Gi0/2')?.allowedVlans
    lab.typeAll('switchport trunk allowed vlan 10')
    expect(allowed()).toEqual([10])
    lab.typeAll('switchport trunk allowed vlan add 20-22')
    expect(allowed()).toEqual([10, 20, 21, 22])
    lab.typeAll('switchport trunk allowed vlan remove 21')
    expect(allowed()).toEqual([10, 20, 22])
    lab.typeAll('switchport trunk allowed vlan none')
    expect(allowed()).toEqual([])
    lab.typeAll('switchport trunk allowed vlan all')
    expect(allowed()).toBe('all')
    lab.typeAll('switchport trunk allowed vlan except 2-4094')
    expect(allowed()).toEqual([1])
    lab.typeAll('switchport trunk allowed vlan add 2-4094')
    expect(allowed()).toBe('all')
    lab.typeAll('switchport trunk allowed vlan remove 1', 'no switchport trunk allowed vlan')
    expect(allowed()).toBe('all')
    lab.typeAll('switchport trunk native vlan 5', 'no switchport trunk native vlan', 'no switchport mode')
    expect(l2Of(lab.device, 'Gi0/2')).toEqual({ mode: 'access', accessVlan: 1, nativeVlan: 1, allowedVlans: 'all' })
  })

  it('renegotiates the line protocol when an up port changes mode', () => {
    const network = cabledLab()
    const [device] = network.devices
    if (device === undefined) throw new Error('lab without switch')
    const lab = new SwitchTranscript(device, { network })
    lab.typeAll('enable', 'conf t')
    const transcript = golden(`
      Switch(config)#interface gi0/1
      Switch(config-if)#switchport mode trunk
      %LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet0/1, changed state to down
      %LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet0/1, changed state to up
      Switch(config-if)#switchport mode trunk
      Switch(config-if)#
    `)
    expect(lab.run(transcript)).toBe(transcript)
  })

  it('offers the IOS help for switchport', () => {
    const lab = new SwitchTranscript(testSwitch())
    lab.typeAll('enable', 'conf t', 'int fa0/1')
    const transcript = golden(`
      Switch(config-if)#switchport ?
        access  Set access mode characteristics of the interface
        mode    Set trunking mode of the interface
        trunk   Set trunking characteristics of the interface
        <cr>
      Switch(config-if)#switchport mode ?
        access  Set trunking mode to ACCESS unconditionally
        trunk   Set trunking mode to TRUNK unconditionally
      Switch(config-if)#switchport trunk allowed vlan ?
        <1-4094>  VLAN IDs of the allowed VLANs when this port is in trunking mode
        add       add VLANs to the current list
        all       all VLANs
        except    all VLANs except the following
        none      no VLANs
        remove    remove VLANs from the current list
      Switch(config-if)#
    `)
    expect(lab.run(transcript)).toBe(transcript)
  })
})

describe('switch CLI: layer-3 switch ports', () => {
  it('turns a port into a routed port and back with no switchport / switchport', () => {
    const lab = new SwitchTranscript(l3Switch())
    lab.typeAll('enable', 'conf t', 'interface gi1/0/1', 'description uplink', 'no switchport')
    expect(portOf(lab.device, 'Gi1/0/1')).toMatchObject({
      role: 'routed',
      description: 'uplink',
      subInterfaces: [],
      l3: { ipv4: { addressing: 'static', address: '', mask: '' } },
    })
    const transcript = golden(`
      Switch(config-if)#switchport mode access
      Command rejected: Gi1/0/1 is not a switching port.
      Switch(config-if)#switchport
      Switch(config-if)#
    `)
    expect(lab.run(transcript)).toBe(transcript)
    expect(portOf(lab.device, 'Gi1/0/1')).toMatchObject({ role: 'switched', description: 'uplink', l2: { mode: 'access', accessVlan: 1 } })
  })

  it('accepts switchport trunk encapsulation dot1q on an L3 switch only', () => {
    const l3 = new SwitchTranscript(l3Switch())
    l3.typeAll('enable', 'conf t', 'int gi1/0/2')
    const accepted = golden(`
      Switch(config-if)#switchport trunk encapsulation dot1q
      Switch(config-if)#switchport mode trunk
      Switch(config-if)#
    `)
    expect(l3.run(accepted)).toBe(accepted)
    const l2 = new SwitchTranscript(testSwitch())
    l2.typeAll('enable', 'conf t', 'int gi0/2')
    const refused = golden(`
      Switch(config-if)#switchport trunk encapsulation dot1q
                                         ^
      % Invalid input detected at '^' marker.

      Switch(config-if)#no switchport
                           ^
      % Invalid input detected at '^' marker.

      Switch(config-if)#
    `)
    expect(l2.run(refused)).toBe(refused)
  })
})

describe('switch CLI: spanning-tree placeholder', () => {
  it('accepts spanning-tree lines and shows the app hint', () => {
    const lab = new SwitchTranscript(testSwitch())
    lab.typeAll('enable', 'conf t')
    const step = lab.shell.submit(lab.state, lab.device, lab.env, 'spanning-tree mode rapid-pvst')
    expect(step.lines).toEqual([{ kind: 'info', message: { key: 'cli:unsupported.spanningTree' } }])
    expect(step.device).toBeUndefined()
    lab.typeAll('int fa0/1')
    const portfast = lab.shell.submit(lab.state, lab.device, lab.env, 'spanning-tree portfast')
    expect(portfast.lines).toEqual([{ kind: 'info', message: { key: 'cli:unsupported.spanningTree' } }])
    const negated = lab.shell.submit(lab.state, lab.device, lab.env, 'no spanning-tree portfast')
    expect(negated.lines).toEqual([{ kind: 'info', message: { key: 'cli:unsupported.spanningTree' } }])
  })
})
