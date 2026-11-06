import { describe, expect, it } from 'vitest'
import type { RouteEntry } from '../../sim/contract'
import { copperLink, RouterCli, runtimeOf, testL3Switch, testSwitch } from './testRouterCli'

const CODES = [
  'Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP',
  '       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area',
  '       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2',
  '       E1 - OSPF external type 1, E2 - OSPF external type 2, E - EGP',
  '       i - IS-IS, L1 - IS-IS level-1, L2 - IS-IS level-2, ia - IS-IS inter area',
  '       * - candidate default, U - per-user static route, o - ODR',
  '       P - periodic downloaded static route',
]

function route(code: RouteEntry['code'], prefix: string, prefixLength: number, nextHop: string | null, exitInterfaceId: string | null, adminDistance = 0): RouteEntry {
  const mask = ['0.0.0.0', '255.0.0.0', '255.255.0.0', '255.255.255.0', '255.255.255.255'][prefixLength / 8] ?? '255.255.255.252'
  return { code, prefix, mask, prefixLength, adminDistance, metric: 0, nextHop, exitInterfaceId }
}

/** R1: Gi0/0 192.168.1.1/24 cabled to a switch and up, Gi0/0.10 10.10.0.1/24, Se0/0/0 addressed but shut. */
function addressedRouter(): RouterCli {
  const cli = new RouterCli()
  cli.peers = [testSwitch()]
  cli.links = [copperLink('l1', ['r1', 'Gi0/0'], ['s1', 'Fa0/1'])]
  cli.configure(
    'hostname R1',
    'int g0/0',
    'ip address 192.168.1.1 255.255.255.0',
    'no shutdown',
    'int g0/0.10',
    'encapsulation dot1Q 10',
    'ip address 10.10.0.1 255.255.255.0',
    'int s0/0/0',
    'ip address 10.1.1.1 255.255.255.252',
    'end',
  )
  return cli
}

describe('router CLI: show ip interface brief', () => {
  it('lists ports and sub-interfaces with address, method and state', () => {
    const cli = addressedRouter()
    cli.configure('int g0/1', 'ip address dhcp', 'end')
    expect(cli.type('show ip interface brief')).toEqual([
      'Interface              IP-Address      OK? Method Status                Protocol',
      'GigabitEthernet0/0     192.168.1.1     YES manual up                    up',
      'GigabitEthernet0/0.10  10.10.0.1       YES manual up                    up',
      'GigabitEthernet0/1     unassigned      YES DHCP   administratively down down',
      'Serial0/0/0            10.1.1.1        YES manual administratively down down',
      'Serial0/0/1            unassigned      YES unset  administratively down down',
    ])
  })

  it('works on switches too: switchports and SVIs', () => {
    const cli = new RouterCli(testL3Switch())
    cli.configure('int vlan 1', 'ip address 10.0.0.2 255.255.255.0', 'no shutdown', 'end')
    const lines = cli.typeAll('terminal length 0', 'show ip interface brief')
    expect(lines[1]).toBe('GigabitEthernet1/0/1   unassigned      YES manual down                  down')
    expect(lines.at(-1)).toBe('Vlan1                  10.0.0.2        YES manual down                  down')
  })
})

describe('router CLI: show ip route', () => {
  it('prints the codes, the gateway of last resort and grouped routes; unresolved statics are hidden', () => {
    const cli = addressedRouter()
    cli.runtime = runtimeOf('r1', {
      routes: [
        route('connected', '192.168.1.0', 24, null, 'Gi0/0'),
        route('local', '192.168.1.1', 32, null, 'Gi0/0'),
        route('connected', '10.10.0.0', 24, null, 'Gi0/0.10'),
        route('local', '10.10.0.1', 32, null, 'Gi0/0.10'),
        route('static', '0.0.0.0', 0, '192.168.1.254', 'Gi0/0', 1),
        route('static', '172.16.0.0', 16, null, 'Gi0/0', 1),
        route('static', '10.30.0.0', 16, '10.1.1.2', null, 5),
        route('static', '10.40.0.0', 16, '192.168.1.3', 'Gi0/0', 1),
        route('static', '10.40.0.0', 16, '192.168.1.4', 'Gi0/0', 50),
      ],
    })
    cli.configure('ip route 10.40.0.0 255.255.0.0 g0/0 192.168.1.3', 'end')
    expect(cli.typeAll('terminal length 0', 'show ip route')).toEqual([
      ...CODES,
      '',
      'Gateway of last resort is 192.168.1.254 to network 0.0.0.0',
      '',
      'S*   0.0.0.0/0 [1/0] via 192.168.1.254',
      '     10.0.0.0/8 is variably subnetted, 3 subnets, 3 masks',
      'C       10.10.0.0/24 is directly connected, GigabitEthernet0/0.10',
      'L       10.10.0.1/32 is directly connected, GigabitEthernet0/0.10',
      'S       10.40.0.0/16 [1/0] via 192.168.1.3, GigabitEthernet0/0',
      'S    172.16.0.0/16 is directly connected, GigabitEthernet0/0',
      '     192.168.1.0/24 is variably subnetted, 2 subnets, 2 masks',
      'C       192.168.1.0/24 is directly connected, GigabitEthernet0/0',
      'L       192.168.1.1/32 is directly connected, GigabitEthernet0/0',
    ])
  })

  it('says the gateway is not set and prints nothing else without a simulation', () => {
    const cli = addressedRouter()
    expect(cli.typeAll('terminal length 0', 'show ip route')).toEqual([...CODES, '', 'Gateway of last resort is not set', ''])
  })

  it('groups equal masks as "is subnetted"', () => {
    const cli = new RouterCli()
    cli.runtime = runtimeOf('r1', { routes: [route('static', '172.16.1.0', 24, '10.0.0.2', 'Gi0/0', 1), route('static', '172.16.2.0', 24, '10.0.0.2', 'Gi0/0', 1)] })
    const lines = cli.typeAll('enable', 'terminal length 0', 'show ip route')
    expect(lines.slice(CODES.length + 3)).toEqual([
      '     172.16.0.0/24 is subnetted, 2 subnets',
      'S       172.16.1.0/24 [1/0] via 10.0.0.2',
      'S       172.16.2.0/24 [1/0] via 10.0.0.2',
    ])
  })

  it('prints the default gateway table when the device does not route', () => {
    const cli = new RouterCli(testL3Switch())
    expect(cli.typeAll('enable', 'show ip route')).toEqual([
      'Default gateway is not set',
      '',
      'Host               Gateway           Last Use    Total Uses  Interface',
      'ICMP redirect cache is empty',
    ])
  })
})

describe('router CLI: show arp', () => {
  it('lists own addresses and the learned entries with their age', () => {
    const cli = addressedRouter()
    cli.now = 185_000
    cli.runtime = runtimeOf('r1', {
      arp: [
        { interfaceId: 'Gi0/0', ip: '192.168.1.20', mac: '00:60:5C:2B:1A:01', state: 'reachable', type: 'dynamic', updatedAt: 0, expiresAt: null, attempts: 1 },
        { interfaceId: 'Gi0/0', ip: '192.168.1.9', mac: null, state: 'incomplete', type: 'dynamic', updatedAt: 180_000, expiresAt: null, attempts: 1 },
        { interfaceId: 'Gi0/0', ip: '192.168.1.30', mac: '00:60:5C:2B:1A:02', state: 'reachable', type: 'dynamic', updatedAt: 0, expiresAt: 1000, attempts: 1 },
      ],
    })
    const expected = [
      'Protocol  Address          Age (min)  Hardware Addr   Type   Interface',
      'Internet  10.10.0.1               -   00D0.BA00.0001  ARPA   GigabitEthernet0/0.10',
      'Internet  192.168.1.1             -   00D0.BA00.0001  ARPA   GigabitEthernet0/0',
      'Internet  192.168.1.9             0   Incomplete',
      'Internet  192.168.1.20            3   0060.5C2B.1A01  ARPA   GigabitEthernet0/0',
    ]
    expect(cli.type('show arp')).toEqual(expected)
    expect(cli.type('show ip arp')).toEqual(expected)
  })
})

describe('router CLI: show ip dhcp', () => {
  function dhcpRouter(): RouterCli {
    const cli = new RouterCli()
    cli.configure('ip dhcp excluded-address 192.168.1.1 192.168.1.10', 'ip dhcp pool LAN', 'network 192.168.1.0 255.255.255.0', 'end')
    cli.runtime = runtimeOf('r1', {
      dhcpBindings: [
        { poolId: 'LAN', ip: '192.168.1.11', mac: '00:01:64:32:A3:B6', state: 'bound', transactionId: 1, leaseStart: 0, leaseExpires: null },
        { poolId: 'LAN', ip: '192.168.1.12', mac: '00:01:64:32:A3:B7', state: 'offered', transactionId: 2, leaseStart: 0, leaseExpires: null },
      ],
    })
    return cli
  }

  it('shows the bound clients', () => {
    expect(dhcpRouter().type('show ip dhcp binding')).toEqual([
      'IP address       Client-ID/              Lease expiration        Type',
      '                 Hardware address',
      '192.168.1.11     0001.6432.A3B6           --                      Automatic',
    ])
  })

  it('shows the pools with their counters', () => {
    const expected = [
      '',
      'Pool LAN :',
      ' Utilization mark (high/low)    : 100 / 0',
      ' Subnet size (first/next)       : 0 / 0',
      ' Total addresses                : 254',
      ' Leased addresses               : 1',
      ' Excluded addresses             : 10',
      ' Pending event                  : none',
      '',
      ' 1 subnet is currently in the pool',
      ' Current index        IP address range                    Leased/Excluded/Total',
      ' 192.168.1.12         192.168.1.1      - 192.168.1.254    1    / 10   / 254',
    ]
    const cli = dhcpRouter()
    expect(cli.typeAll('terminal length 0', 'show ip dhcp pool')).toEqual(expected)
    expect(cli.type('show ip dhcp pool LAN')).toEqual(expected)
    expect(cli.type('show ip dhcp pool OTHER')).toEqual([])
  })
})
