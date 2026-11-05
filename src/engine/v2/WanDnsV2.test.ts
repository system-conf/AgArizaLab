import { describe, expect, it } from 'vitest'
import type { DeviceV2, DnsServerSettings, NetworkStateV2 } from '../../domain/v2'
import { DefaultNetworkEngineV2 } from './DefaultNetworkEngineV2'
import { accessV2, cloudV2, editDevice, editHost, editLink, editPort, hostV2, linkV2, routerV2, switchV2, textOf } from './testLabsV2'

const engine = new DefaultNetworkEngineV2()

const DNS: DnsServerSettings = { enabled: true, forwarders: ['8.8.8.8'], records: [{ type: 'A', name: 'intranet.local', address: '192.168.1.50' }] }

/**
 * pc 192.168.1.10 and server dns1 192.168.1.53 on sw — r (Gi0/0 192.168.1.1, DNS service; Gi0/1 WAN
 * without address, default route out Gi0/1) — cloud eth0.
 */
function wanLab(serviceUp = true): NetworkStateV2 {
  const router: DeviceV2 = {
    ...routerV2('r', [{ id: 'Gi0/0', ip: '192.168.1.1' }, { id: 'Gi0/1', addressing: 'dhcp' }], [
      { prefix: '0.0.0.0', mask: '0.0.0.0', exitInterfaceId: 'Gi0/1', adminDistance: 1 },
    ]),
    services: { dns: DNS },
  }
  const server: DeviceV2 = {
    ...hostV2('dns1', '192.168.1.53', { kind: 'server', gateway: '192.168.1.1' }),
    services: { dns: { enabled: true, forwarders: ['192.168.1.1'], records: [{ type: 'A', name: 'printer.local', address: '192.168.1.60' }] } },
  }
  return {
    devices: [
      cloudV2('internet', { eth0: serviceUp }),
      router,
      switchV2('sw', [accessV2(1), accessV2(1), accessV2(1)]),
      hostV2('pc', '192.168.1.10', { gateway: '192.168.1.1', dns: ['192.168.1.1'] }),
      server,
    ],
    links: [
      linkV2('wan', ['internet', 'eth0'], ['r', 'Gi0/1']),
      linkV2('uplink', ['r', 'Gi0/0'], ['sw', 'Fa0/1']),
      linkV2('pcLink', ['pc', 'eth0'], ['sw', 'Fa0/2']),
      linkV2('serverLink', ['dns1', 'eth0'], ['sw', 'Fa0/3']),
    ],
  }
}

function withRouterDns(state: NetworkStateV2, dns: Partial<DnsServerSettings>): NetworkStateV2 {
  return editDevice(state, 'r', (router) => ({ ...router, services: { ...router.services, dns: { ...DNS, ...dns } } }))
}

describe('internet through a routed port cabled to the cloud', () => {
  it('reaches public addresses when the route leads to a serving cloud port', () => {
    expect(engine.reach(wanLab(), 'pc', '8.8.8.8')).toEqual({ ok: true, path: ['pc', 'sw', 'r', 'internet'] })
    expect(textOf(engine.runCommand(wanLab(), 'pc', 'tracert 8.8.8.8').lines)).toContain('  2    14 ms    15 ms    14 ms  8.8.8.8')
  })

  it('is down on a provider outage while the link light stays green', () => {
    expect(engine.reach(wanLab(false), 'pc', '8.8.8.8')).toEqual({ ok: false, reason: 'wanDown', atDeviceId: 'r' })
    expect(engine.linkLight(wanLab(false), 'wan')).toBe('up')
  })

  it('is down when the WAN cable is unplugged, the port shut or the cloud off', () => {
    const unplugged = editLink(wanLab(), 'wan', (link) => ({ ...link, connected: false }))
    const shut = editPort(wanLab(), 'r', 'Gi0/1', (port) => ({ ...port, adminUp: false }))
    const cloudOff = editDevice(wanLab(), 'internet', (device) => ({ ...device, powered: false }))
    for (const state of [unplugged, shut, cloudOff]) {
      expect(engine.reach(state, 'pc', '8.8.8.8')).toEqual({ ok: false, reason: 'wanDown', atDeviceId: 'r' })
      expect(engine.linkLight(state, 'wan')).toBe('down')
    }
  })

  it('is down without a default route; private networks get no route', () => {
    const noRoute = editDevice(wanLab(), 'r', (router) => ({ ...router, routing: { ipRouting: true, staticRoutes: [] } }))
    expect(engine.reach(noRoute, 'pc', '8.8.8.8')).toEqual({ ok: false, reason: 'wanDown', atDeviceId: 'r' })
    expect(engine.reach(wanLab(), 'pc', '10.20.30.40')).toEqual({ ok: false, reason: 'noRouteToDestination', atDeviceId: 'r' })
  })

  it('gives an end device cabled straight to the cloud no service', () => {
    const state: NetworkStateV2 = {
      devices: [cloudV2(), hostV2('pc', '203.0.113.99', { gateway: '203.0.113.1' })],
      links: [linkV2('direct', ['pc', 'eth0'], ['internet', 'eth0'])],
    }
    expect(engine.reach(state, 'pc', '8.8.8.8')).toEqual({ ok: false, reason: 'gatewayUnreachable', atDeviceId: 'pc' })
  })
})

describe('DNS service and forwarders', () => {
  it('forwards to the configured upstream resolver', () => {
    expect(engine.resolve(wanLab(), 'pc', 'google.com')).toEqual({ ok: true, ip: '142.250.187.206', dnsServer: '192.168.1.1' })
    expect(engine.resolve(wanLab(), 'pc', 'yok.example')).toEqual({ ok: false, reason: 'nameNotFound', dnsServer: '192.168.1.1' })
  })

  it('times out when the forwarder is unreachable, but still answers its own records', () => {
    expect(engine.resolve(wanLab(false), 'pc', 'google.com')).toEqual({ ok: false, reason: 'dnsUnreachable', dnsServer: '192.168.1.1' })
    expect(engine.resolve(wanLab(false), 'pc', 'INTRANET.local.')).toEqual({ ok: true, ip: '192.168.1.50', dnsServer: '192.168.1.1' })
  })

  it('answers only from records without forwarders, and not at all when disabled', () => {
    expect(engine.resolve(withRouterDns(wanLab(), { forwarders: [] }), 'pc', 'google.com')).toMatchObject({ ok: false, reason: 'nameNotFound' })
    expect(engine.resolve(withRouterDns(wanLab(), { enabled: false }), 'pc', 'google.com')).toMatchObject({ ok: false, reason: 'dnsNoAnswer' })
  })

  it('lets a DNS server device answer its records and forward the rest to the router', () => {
    const state = editHost(wanLab(), 'pc', { dnsServers: ['192.168.1.53'] })
    expect(engine.resolve(state, 'pc', 'printer.local')).toEqual({ ok: true, ip: '192.168.1.60', dnsServer: '192.168.1.53' })
    expect(engine.resolve(state, 'pc', 'intranet.local')).toEqual({ ok: true, ip: '192.168.1.50', dnsServer: '192.168.1.53' })
    expect(engine.resolve(state, 'pc', 'google.com')).toMatchObject({ ok: true, ip: '142.250.187.206' })
    expect(engine.resolve(editHost(wanLab(false), 'pc', { dnsServers: ['192.168.1.53'] }), 'pc', 'google.com')).toMatchObject({
      ok: false,
      reason: 'dnsUnreachable',
    })
  })

  it('prints the forwarder answer in nslookup', () => {
    expect(textOf(engine.runCommand(wanLab(), 'pc', 'nslookup google.com').lines)).toEqual([
      'Server:  UnKnown',
      'Address:  192.168.1.1',
      '',
      'Non-authoritative answer:',
      'Name:    google.com',
      'Address:  142.250.187.206',
    ])
  })
})
