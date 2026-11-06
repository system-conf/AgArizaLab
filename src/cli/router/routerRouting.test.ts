import { describe, expect, it } from 'vitest'
import { RouterCli, testL3Switch, testSwitch } from './testRouterCli'

describe('router CLI: ip route', () => {
  it('adds static routes by next hop, exit interface or both, with a distance', () => {
    const cli = new RouterCli()
    cli.configure(
      'ip route 0.0.0.0 0.0.0.0 192.168.1.254',
      'ip route 10.20.0.0 255.255.0.0 g0/1',
      'ip route 10.30.0.0 255.255.0.0 s0/0/0 10.1.1.2 5',
      'ip route 10.40.0.0 255.255.0.0 10.1.1.6 200',
    )
    expect(cli.device.routing?.staticRoutes).toEqual([
      { prefix: '0.0.0.0', mask: '0.0.0.0', adminDistance: 1, nextHop: '192.168.1.254' },
      { prefix: '10.20.0.0', mask: '255.255.0.0', adminDistance: 1, exitInterfaceId: 'Gi0/1' },
      { prefix: '10.30.0.0', mask: '255.255.0.0', adminDistance: 5, nextHop: '10.1.1.2', exitInterfaceId: 'Se0/0/0' },
      { prefix: '10.40.0.0', mask: '255.255.0.0', adminDistance: 200, nextHop: '10.1.1.6' },
    ])
    expect(cli.config()).toEqual(
      expect.arrayContaining([
        'ip route 0.0.0.0 0.0.0.0 192.168.1.254',
        'ip route 10.20.0.0 255.255.0.0 GigabitEthernet0/1',
        'ip route 10.30.0.0 255.255.0.0 Serial0/0/0 10.1.1.2 5',
        'ip route 10.40.0.0 255.255.0.0 10.1.1.6 200',
      ]),
    )
  })

  it('replaces the same route with a new distance instead of adding it twice', () => {
    const cli = new RouterCli()
    cli.configure('ip route 10.0.0.0 255.0.0.0 192.168.1.2', 'ip route 10.0.0.0 255.0.0.0 192.168.1.2 10')
    expect(cli.device.routing?.staticRoutes).toEqual([{ prefix: '10.0.0.0', mask: '255.0.0.0', adminDistance: 10, nextHop: '192.168.1.2' }])
  })

  it('prints the IOS errors for bad routes', () => {
    const cli = new RouterCli()
    cli.configure('int g0/0', 'ip address 192.168.1.1 255.255.255.0', 'exit')
    expect(cli.type('ip route 10.20.0.1 255.255.0.0 1.1.1.1')).toEqual(['%Inconsistent address and mask'])
    expect(cli.type('ip route 10.20.0.0 255.0.255.0 1.1.1.1')).toEqual(['%Inconsistent address and mask'])
    expect(cli.type('ip route 10.20.0.0 255.255.0.0 192.168.1.1')).toEqual(["%Invalid next hop address (it's this router)"])
    expect(cli.type('ip route 10.20.0.0 255.255.0.0')).toEqual(['% Incomplete command.', ''])
    expect(cli.type('no ip route 10.99.0.0 255.255.0.0')).toEqual(['%No matching route to delete'])
    expect(cli.device.routing?.staticRoutes).toEqual([])
  })

  it('removes routes with no ip route, all of a prefix or only the typed one', () => {
    const cli = new RouterCli()
    cli.configure('ip route 10.0.0.0 255.0.0.0 192.168.1.2', 'ip route 10.0.0.0 255.0.0.0 192.168.1.3 5', 'ip route 0.0.0.0 0.0.0.0 g0/0')
    cli.type('no ip route 10.0.0.0 255.0.0.0 192.168.1.3')
    expect(cli.device.routing?.staticRoutes.map((route) => route.nextHop ?? route.exitInterfaceId)).toEqual(['192.168.1.2', 'Gi0/0'])
    cli.type('no ip route 0.0.0.0 0.0.0.0 gigabitEthernet 0/0')
    cli.type('no ip route 10.0.0.0 255.0.0.0')
    expect(cli.device.routing?.staticRoutes).toEqual([])
  })

  it('offers next hops and interfaces after the mask', () => {
    const cli = new RouterCli()
    cli.configure()
    expect(cli.help('ip route 0.0.0.0 0.0.0.0 ')).toEqual([
      "  A.B.C.D          Forwarding router's address",
      '  GigabitEthernet  GigabitEthernet IEEE 802.3z',
      '  Serial           Serial',
    ])
  })
})

describe('router CLI: ip routing', () => {
  it('turns routing on for an L3 switch and writes it to running-config', () => {
    const cli = new RouterCli(testL3Switch())
    expect(cli.device.routing?.ipRouting).toBe(false)
    cli.configure('ip routing')
    expect(cli.device.routing?.ipRouting).toBe(true)
    expect(cli.config()).toContain('ip routing')
    cli.type('no ip routing')
    expect(cli.config()).not.toContain('ip routing')
  })

  it('writes no ip routing only when a router stops routing', () => {
    const cli = new RouterCli()
    expect(cli.config()).not.toContain('no ip routing')
    cli.configure('no ip routing')
    expect(cli.device.routing?.ipRouting).toBe(false)
    expect(cli.config()).toContain('no ip routing')
  })

  it('has no ip routing or ip route on a layer-2 switch', () => {
    const cli = new RouterCli(testSwitch())
    cli.configure()
    expect(cli.type('ip routing')).toEqual([`${' '.repeat('Switch(config)#'.length + 3)}^`, "% Invalid input detected at '^' marker.", ''])
    expect(cli.help('ip ').map((line) => line.trim().split(/\s+/)[0])).toEqual(['domain-lookup', 'name-server'])
  })
})

describe('router CLI: name resolution', () => {
  it('stores name servers, the DNS server switch and static hosts', () => {
    const cli = new RouterCli()
    cli.configure('ip name-server 8.8.8.8 8.8.4.4', 'ip name-server 8.8.8.8', 'ip dns server', 'ip host WWW.Lab.local 192.168.1.50')
    expect(cli.device.services?.dns).toEqual({
      enabled: true,
      forwarders: ['8.8.8.8', '8.8.4.4'],
      records: [{ type: 'A', name: 'www.lab.local', address: '192.168.1.50' }],
    })
    expect(cli.config()).toEqual(
      expect.arrayContaining(['ip host www.lab.local 192.168.1.50', 'ip name-server 8.8.8.8', 'ip name-server 8.8.4.4', 'ip dns server']),
    )
  })

  it('drops the DNS settings again when everything is removed', () => {
    const cli = new RouterCli()
    cli.configure('ip name-server 8.8.8.8 8.8.4.4', 'ip host srv 10.0.0.9', 'ip dns server')
    cli.typeAll('no ip name-server 8.8.4.4')
    expect(cli.device.services?.dns?.forwarders).toEqual(['8.8.8.8'])
    cli.typeAll('no ip name-server', 'no ip host srv', 'no ip dns server')
    expect(cli.device.services).toBeUndefined()
  })

  it('switches domain lookup off and on (core command)', () => {
    const cli = new RouterCli()
    cli.configure('no ip domain-lookup')
    expect(cli.config()).toContain('no ip domain-lookup')
    cli.type('ip domain-lookup')
    expect(cli.config()).not.toContain('no ip domain-lookup')
  })
})
