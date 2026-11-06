import { describe, expect, it } from 'vitest'
import { testSwitch } from '../core/testCli'
import { golden, SwitchTranscript } from './testSwitchLab'

describe('switch CLI: vlan and name', () => {
  it('creates VLANs, names them and lists them in show vlan brief', () => {
    const lab = new SwitchTranscript(testSwitch())
    const transcript = golden(`
      Switch>enable
      Switch#configure terminal
      Enter configuration commands, one per line.  End with CNTL/Z.
      Switch(config)#vlan 10
      Switch(config-vlan)#name SALES
      Switch(config-vlan)#exit
      Switch(config)#vlan 20,30-31
      Switch(config-vlan)#exit
      Switch(config)#interface range fa0/1 - 2
      Switch(config-if-range)#switchport access vlan 10
      Switch(config-if-range)#end
      %SYS-5-CONFIG_I: Configured from console by console
      Switch#show vlan brief
      VLAN Name                             Status    Ports
      ---- -------------------------------- --------- -------------------------------
      1    default                          active    Fa0/3, Fa0/4, Fa0/5, Fa0/6
                                                      Fa0/7, Fa0/8, Fa0/9, Fa0/10
                                                      Fa0/11, Fa0/12, Fa0/13, Fa0/14
                                                      Fa0/15, Fa0/16, Fa0/17, Fa0/18
                                                      Fa0/19, Fa0/20, Fa0/21, Fa0/22
                                                      Fa0/23, Fa0/24, Gi0/1, Gi0/2
      10   SALES                            active    Fa0/1, Fa0/2
      20   VLAN0020                         active
      30   VLAN0030                         active
      31   VLAN0031                         active
      1002 fddi-default                     act/unsup
      1003 token-ring-default               act/unsup
      1004 fddinet-default                  act/unsup
      1005 trnet-default                    act/unsup
    `)
    expect(lab.run(transcript)).toBe(transcript)
    expect(lab.device.switching?.vlans).toEqual([
      { id: 1, name: 'default' },
      { id: 10, name: 'SALES' },
      { id: 20, name: 'VLAN0020' },
      { id: 30, name: 'VLAN0030' },
      { id: 31, name: 'VLAN0031' },
    ])
  })

  it('restores the default name, deletes VLANs and protects the default VLANs', () => {
    const lab = new SwitchTranscript(testSwitch())
    lab.typeAll('enable', 'conf t')
    const transcript = golden(`
      Switch(config)#vlan 10
      Switch(config-vlan)#name ADMIN
      Switch(config-vlan)#no name
      Switch(config-vlan)#exit
      Switch(config)#vlan 1
      Switch(config-vlan)#name OTHER
      %Default VLAN 1 may not have its name changed.
      Switch(config-vlan)#exit
      Switch(config)#vlan 20
      Switch(config-vlan)#exit
      Switch(config)#no vlan 1,20
      %Default VLAN 1 may not be deleted.
      Switch(config)#no vlan 1003
      %Default VLAN 1003 may not be deleted.
    `)
    expect(lab.run(transcript)).toBe(transcript)
    expect(lab.device.switching?.vlans).toEqual([
      { id: 1, name: 'default' },
      { id: 10, name: 'VLAN0010' },
    ])
  })

  it('leaves the VLAN mode for a global command (sub-mode fallback)', () => {
    const lab = new SwitchTranscript(testSwitch())
    lab.typeAll('enable', 'conf t')
    const transcript = golden(`
      Switch(config)#vlan 99
      Switch(config-vlan)#name MGMT
      Switch(config-vlan)#hostname S1
      S1(config)#
    `)
    expect(lab.run(transcript)).toBe(transcript)
    expect(lab.device.switching?.vlans.map((vlan) => vlan.name)).toEqual(['default', 'MGMT'])
  })

  it('rejects VLAN ids outside 1-4094 with a caret', () => {
    const lab = new SwitchTranscript(testSwitch())
    lab.typeAll('enable', 'conf t')
    const transcript = golden(`
      Switch(config)#vlan 4095
                          ^
      % Invalid input detected at '^' marker.

      Switch(config)#vlan ?
        <1-4094>  VLAN ID 1-4094
      Switch(config)#
    `)
    expect(lab.run(transcript)).toBe(transcript)
  })

  it('prints the full show vlan tables', () => {
    const lab = new SwitchTranscript(testSwitch())
    lab.typeAll('enable', 'terminal length 0', 'conf t', 'vlan 10', 'name SALES', 'end')
    const transcript = golden(`
      Switch#show vlan
      VLAN Name                             Status    Ports
      ---- -------------------------------- --------- -------------------------------
      1    default                          active    Fa0/1, Fa0/2, Fa0/3, Fa0/4
                                                      Fa0/5, Fa0/6, Fa0/7, Fa0/8
                                                      Fa0/9, Fa0/10, Fa0/11, Fa0/12
                                                      Fa0/13, Fa0/14, Fa0/15, Fa0/16
                                                      Fa0/17, Fa0/18, Fa0/19, Fa0/20
                                                      Fa0/21, Fa0/22, Fa0/23, Fa0/24
                                                      Gi0/1, Gi0/2
      10   SALES                            active
      1002 fddi-default                     act/unsup
      1003 token-ring-default               act/unsup
      1004 fddinet-default                  act/unsup
      1005 trnet-default                    act/unsup

      VLAN Type  SAID       MTU   Parent RingNo BridgeNo Stp  BrdgMode Trans1 Trans2
      ---- ----- ---------- ----- ------ ------ -------- ---- -------- ------ ------
      1    enet  100001     1500  -      -      -        -    -        0      0
      10   enet  100010     1500  -      -      -        -    -        0      0
      1002 fddi  101002     1500  -      -      -        -    -        0      0
      1003 tr    101003     1500  -      -      -        -    -        0      0
      1004 fdnet 101004     1500  -      -      -        ieee -        0      0
      1005 trnet 101005     1500  -      -      -        ibm  -        0      0

      Remote SPAN VLANs
      ------------------------------------------------------------------------------


      Primary Secondary Type              Ports
      ------- --------- ----------------- ------------------------------------------
    `)
    expect(lab.run(transcript)).toBe(transcript)
  })
})
