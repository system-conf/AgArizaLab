import { describe, expect, it } from 'vitest'
import { RouterCli } from './testRouterCli'

describe('router CLI: DHCP pools', () => {
  it('configures a pool in the dhcp-config mode', () => {
    const cli = new RouterCli()
    cli.configure('ip dhcp pool LAN')
    expect(cli.prompt).toBe('Router(dhcp-config)#')
    expect(cli.state.mode).toEqual({ kind: 'dhcpPool', poolId: 'LAN' })
    expect(cli.typeAll('network 192.168.1.0 255.255.255.0', 'default-router 192.168.1.1', 'dns-server 8.8.8.8 8.8.4.4', 'lease 7')).toEqual([])
    expect(cli.device.services?.dhcp).toEqual({
      enabled: true,
      pools: [{ id: 'LAN', network: '192.168.1.0', mask: '255.255.255.0', defaultRouter: '192.168.1.1', dnsServers: ['8.8.8.8', '8.8.4.4'], leases: [] }],
      excludedRanges: [],
    })
    cli.type('exit')
    expect(cli.prompt).toBe('Router(config)#')
  })

  it('clears host bits of the network and takes the classful mask when none is given', () => {
    const cli = new RouterCli()
    cli.configure('ip dhcp pool A', 'network 192.168.1.77 255.255.255.0', 'ip dhcp pool B', 'network 10.0.0.0')
    expect(cli.device.services?.dhcp?.pools.map((pool) => `${pool.network}/${pool.mask}`)).toEqual(['192.168.1.0/255.255.255.0', '10.0.0.0/255.0.0.0'])
    expect(cli.type('network 10.0.0.0 255.0.255.0')).toEqual(['% Invalid mask'])
  })

  it('removes pool settings and pools with no', () => {
    const cli = new RouterCli()
    cli.configure('ip dhcp pool LAN', 'network 192.168.1.0 255.255.255.0', 'default-router 192.168.1.1', 'dns-server 8.8.8.8')
    cli.typeAll('no default-router', 'no dns-server', 'no network')
    expect(cli.device.services?.dhcp?.pools).toEqual([{ id: 'LAN', network: '', mask: '', defaultRouter: '', dnsServers: [], leases: [] }])
    cli.typeAll('exit', 'no ip dhcp pool LAN')
    expect(cli.device.services).toBeUndefined()
    expect(cli.type('no ip dhcp pool LAN')).toEqual(['%DHCP pool LAN does not exist.'])
  })

  it('excludes single addresses and ranges', () => {
    const cli = new RouterCli()
    cli.configure('ip dhcp excluded-address 192.168.1.1 192.168.1.10', 'ip dhcp excluded-address 192.168.1.254')
    expect(cli.device.services?.dhcp?.excludedRanges).toEqual([
      { start: '192.168.1.1', end: '192.168.1.10' },
      { start: '192.168.1.254', end: '192.168.1.254' },
    ])
    expect(cli.config()).toEqual(expect.arrayContaining(['ip dhcp excluded-address 192.168.1.1 192.168.1.10', 'ip dhcp excluded-address 192.168.1.254']))
    expect(cli.type('ip dhcp excluded-address 192.168.1.10 192.168.1.1')).toEqual(['% Invalid address range'])
    expect(cli.type('no ip dhcp excluded-address 192.168.1.2')).toEqual(['% Range [192.168.1.2, 192.168.1.2] is not in the database.'])
    cli.typeAll('no ip dhcp excluded-address 192.168.1.1 192.168.1.10', 'no ip dhcp excluded-address 192.168.1.254')
    expect(cli.device.services).toBeUndefined()
  })

  it('turns the DHCP service off with no service dhcp', () => {
    const cli = new RouterCli()
    cli.configure('no service dhcp')
    expect(cli.device.services?.dhcp?.enabled).toBe(false)
    expect(cli.config()).toContain('no service dhcp')
    cli.type('service dhcp')
    expect(cli.device.services).toBeUndefined()
  })

  it('writes the pool blocks to running-config', () => {
    const cli = new RouterCli()
    cli.configure(
      'ip dhcp excluded-address 192.168.1.1 192.168.1.10',
      'ip dhcp pool LAN',
      'network 192.168.1.0 255.255.255.0',
      'default-router 192.168.1.1',
      'dns-server 8.8.8.8 8.8.4.4',
    )
    const config = cli.config()
    const start = config.indexOf('ip dhcp excluded-address 192.168.1.1 192.168.1.10')
    expect(config.slice(start, start + 7)).toEqual([
      'ip dhcp excluded-address 192.168.1.1 192.168.1.10',
      '!',
      'ip dhcp pool LAN',
      ' network 192.168.1.0 255.255.255.0',
      ' default-router 192.168.1.1',
      ' dns-server 8.8.8.8 8.8.4.4',
      '!',
    ])
  })
})
