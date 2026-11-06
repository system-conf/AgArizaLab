import { describe, expect, it } from 'vitest'
import type { Device, NetworkState } from '../../domain'
import type { MacTableEntry, RequestRecord } from '../../sim/contract'
import { testSwitch } from '../core/testCli'
import { cabledLab, golden, macRuntime, SwitchTranscript } from './testSwitchLab'

function cabledSwitch(): { network: NetworkState; device: Device } {
  const network = cabledLab()
  const [device] = network.devices
  if (device === undefined) throw new Error('lab without switch')
  return { network, device }
}

const MAC_ENTRIES: readonly MacTableEntry[] = [
  { vlan: 10, mac: '00:D0:BA:00:01:02', portId: 'Fa0/2', type: 'dynamic', learnedAt: 0, expiresAt: 300_000 },
  { vlan: 1, mac: '00:D0:BA:00:01:01', portId: 'Fa0/1', type: 'dynamic', learnedAt: 0, expiresAt: 300_000 },
  { vlan: 1, mac: '00:D0:BA:00:01:03', portId: 'Gi0/1', type: 'dynamic', learnedAt: 0, expiresAt: 300_000 },
  { vlan: 1, mac: '00:D0:BA:00:09:09', portId: 'Gi0/1', type: 'dynamic', learnedAt: 0, expiresAt: 1_000 },
  { vlan: 10, mac: '00:D0:BA:00:0A:0A', portId: 'Fa0/3', type: 'static', learnedAt: 0, expiresAt: null },
]

describe('switch CLI: show interfaces', () => {
  it('prints show interfaces status with link state, VLAN, duplex and speed', () => {
    const { network, device } = cabledSwitch()
    const lab = new SwitchTranscript(device, { network })
    lab.typeAll(
      'enable',
      'terminal length 0',
      'conf t',
      'int fa0/2',
      'description Accounting printer 2nd floor',
      'switchport access vlan 10',
      'int fa0/3',
      'shutdown',
      'int fa0/4',
      'speed 10',
      'duplex half',
      'int gi0/1',
      'switchport mode trunk',
      'end',
    )
    const transcript = golden(`
      Switch#show interfaces status
      Port      Name               Status       Vlan       Duplex  Speed Type
      Fa0/1                        connected    1          a-full  a-100 10/100BaseTX
      Fa0/2     Accounting printer connected    10         a-full  a-100 10/100BaseTX
      Fa0/3                        disabled     1            auto   auto 10/100BaseTX
      Fa0/4                        notconnect   1            half     10 10/100BaseTX
      Fa0/5                        notconnect   1            auto   auto 10/100BaseTX
      Fa0/6                        notconnect   1            auto   auto 10/100BaseTX
      Fa0/7                        notconnect   1            auto   auto 10/100BaseTX
      Fa0/8                        notconnect   1            auto   auto 10/100BaseTX
      Fa0/9                        notconnect   1            auto   auto 10/100BaseTX
      Fa0/10                       notconnect   1            auto   auto 10/100BaseTX
      Fa0/11                       notconnect   1            auto   auto 10/100BaseTX
      Fa0/12                       notconnect   1            auto   auto 10/100BaseTX
      Fa0/13                       notconnect   1            auto   auto 10/100BaseTX
      Fa0/14                       notconnect   1            auto   auto 10/100BaseTX
      Fa0/15                       notconnect   1            auto   auto 10/100BaseTX
      Fa0/16                       notconnect   1            auto   auto 10/100BaseTX
      Fa0/17                       notconnect   1            auto   auto 10/100BaseTX
      Fa0/18                       notconnect   1            auto   auto 10/100BaseTX
      Fa0/19                       notconnect   1            auto   auto 10/100BaseTX
      Fa0/20                       notconnect   1            auto   auto 10/100BaseTX
      Fa0/21                       notconnect   1            auto   auto 10/100BaseTX
      Fa0/22                       notconnect   1            auto   auto 10/100BaseTX
      Fa0/23                       notconnect   1            auto   auto 10/100BaseTX
      Fa0/24                       notconnect   1            auto   auto 10/100BaseTX
      Gi0/1                        connected    trunk      a-full a-1000 10/100/1000BaseTX
      Gi0/2                        notconnect   1            auto   auto 10/100/1000BaseTX
    `)
    expect(lab.run(transcript)).toBe(transcript)
  })

  it('lists operational trunks in show interfaces trunk', () => {
    const { network, device } = cabledSwitch()
    const lab = new SwitchTranscript(device, { network })
    lab.typeAll('enable', 'conf t', 'vlan 10,20,99', 'exit', 'int range gi0/1 - 2', 'switchport mode trunk', 'switchport trunk native vlan 99', 'int gi0/1', 'switchport trunk allowed vlan 1,10,30-40,99', 'end')
    const transcript = golden(`
      Switch#show interfaces trunk
      Port        Mode             Encapsulation  Status        Native vlan
      Gi0/1       on               802.1q         trunking      99

      Port        Vlans allowed on trunk
      Gi0/1       1,10,30-40,99

      Port        Vlans allowed and active in management domain
      Gi0/1       1,10,99

      Port        Vlans in spanning tree forwarding state and not pruned
      Gi0/1       1,10,99
      Switch#configure terminal
      Enter configuration commands, one per line.  End with CNTL/Z.
      Switch(config)#interface gi0/1
      Switch(config-if)#switchport trunk allowed vlan 30
      Switch(config-if)#do show interfaces trunk
      Port        Mode             Encapsulation  Status        Native vlan
      Gi0/1       on               802.1q         trunking      99

      Port        Vlans allowed on trunk
      Gi0/1       30

      Port        Vlans allowed and active in management domain
      Gi0/1       none

      Port        Vlans in spanning tree forwarding state and not pruned
      Gi0/1       none
      Switch(config-if)#shutdown
      %LINK-5-CHANGED: Interface GigabitEthernet0/1, changed state to administratively down
      Switch(config-if)#do show interfaces trunk
      Switch(config-if)#
    `)
    expect(lab.run(transcript)).toBe(transcript)
  })
})

describe('switch CLI: MAC address table', () => {
  it('prints the live entries of the simulator runtime', () => {
    const lab = new SwitchTranscript(testSwitch(), { runtime: macRuntime('s1', MAC_ENTRIES), now: 2_000 })
    const transcript = golden(`
      Switch>show mac address-table
                Mac Address Table
      -------------------------------------------

      Vlan    Mac Address       Type        Ports
      ----    -----------       --------    -----
         1    00d0.ba00.0101    DYNAMIC     Fa0/1
         1    00d0.ba00.0103    DYNAMIC     Gi0/1
        10    00d0.ba00.0102    DYNAMIC     Fa0/2
        10    00d0.ba00.0a0a    STATIC      Fa0/3
      Total Mac Addresses for this criterion: 4
      Switch>show mac address-table dynamic vlan 10
                Mac Address Table
      -------------------------------------------

      Vlan    Mac Address       Type        Ports
      ----    -----------       --------    -----
        10    00d0.ba00.0102    DYNAMIC     Fa0/2
      Total Mac Addresses for this criterion: 1
      Switch>show mac address-table interface gi0/1
                Mac Address Table
      -------------------------------------------

      Vlan    Mac Address       Type        Ports
      ----    -----------       --------    -----
         1    00d0.ba00.0103    DYNAMIC     Gi0/1
      Total Mac Addresses for this criterion: 1
      Switch>show mac-address-table address 00d0.ba00.0a0a
                Mac Address Table
      -------------------------------------------

      Vlan    Mac Address       Type        Ports
      ----    -----------       --------    -----
        10    00d0.ba00.0a0a    STATIC      Fa0/3
      Total Mac Addresses for this criterion: 1
      Switch>
    `)
    expect(lab.run(transcript)).toBe(transcript)
  })

  it('prints an empty table without a running simulation', () => {
    const lab = new SwitchTranscript(testSwitch())
    const transcript = golden(`
      Switch>show mac address-table static
                Mac Address Table
      -------------------------------------------

      Vlan    Mac Address       Type        Ports
      ----    -----------       --------    -----
      Total Mac Addresses for this criterion: 0
      Switch>
    `)
    expect(lab.run(transcript)).toBe(transcript)
  })

  it('clears the dynamic entries through a simulator job', () => {
    const lab = new SwitchTranscript(testSwitch(), { runtime: macRuntime('s1', MAC_ENTRIES) })
    lab.typeAll('enable')
    const step = lab.shell.submit(lab.state, lab.device, lab.env, 'clear mac address-table dynamic')
    expect(step.job).toEqual({ kind: 'clearTable', deviceId: 's1', table: 'mac' })
    expect(step.input).toBe('busy')
    lab.take(step)
    const record: RequestRecord = {
      id: 'r1',
      request: { kind: 'clearTable', deviceId: 's1', table: 'mac' },
      status: 'done',
      queuedAt: 0,
      finishedAt: 0,
      result: null,
    }
    const done = lab.shell.resume(lab.state, lab.device, lab.env, record)
    expect(done.lines).toEqual([])
    expect(done.prompt).toBe('Switch#')
  })
})
