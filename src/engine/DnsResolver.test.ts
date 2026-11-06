import { describe, expect, it } from 'vitest'
import { DefaultNetworkEngine } from './DefaultNetworkEngine'
import { DnsResolver } from './DnsResolver'
import { ReachabilityChecker } from './ReachabilityChecker'
import { SegmentFinder } from './SegmentFinder'
import { editHost } from './testLabs'
import { editNic, editRouterServices, officeLab, wanDown } from './testNetworks'

const engine = new DefaultNetworkEngine()
// resolveTarget (ping / tracert targets) is not part of the engine contract.
const resolver = new DnsResolver(new ReachabilityChecker(new SegmentFinder()))

describe('DnsResolver', () => {
  it('resolves a known name through a public DNS server', () => {
    expect(engine.resolve(officeLab(), 'pc1', 'google.com')).toEqual({
      ok: true,
      ip: '142.250.187.206',
      dnsServer: '8.8.8.8',
    })
  })

  it('normalises case and a trailing dot', () => {
    expect(engine.resolve(officeLab(), 'pc1', 'ODEME.ornekbanka.com.tr.')).toMatchObject({ ok: true, ip: '203.0.113.10' })
  })

  it('fails with dnsNotSet when no server is configured', () => {
    const state = editHost(officeLab(), 'pc1', { dnsServers: [] })
    expect(engine.resolve(state, 'pc1', 'google.com')).toEqual({ ok: false, reason: 'dnsNotSet' })
  })

  it('fails with nameNotFound for an unknown name', () => {
    expect(engine.resolve(officeLab(), 'pc1', 'yok.example')).toEqual({
      ok: false,
      reason: 'nameNotFound',
      dnsServer: '8.8.8.8',
    })
  })

  it('uses router DNS forwarding when the WAN is up', () => {
    expect(engine.resolve(officeLab(), 'pc2', 'google.com')).toMatchObject({ ok: true, dnsServer: '192.168.1.1' })
  })

  it('times out on a forwarder whose WAN is down', () => {
    expect(engine.resolve(wanDown(officeLab()), 'pc2', 'google.com')).toEqual({
      ok: false,
      reason: 'dnsUnreachable',
      dnsServer: '192.168.1.1',
    })
  })

  it('fails with dnsNoAnswer when the router answers ping but does not forward DNS', () => {
    const state = editRouterServices(officeLab(), (services) => ({ ...services, dns: services.dns && { ...services.dns, enabled: false } }))
    expect(engine.resolve(state, 'pc2', 'google.com')).toMatchObject({ ok: false, reason: 'dnsNoAnswer' })
  })

  it('fails with dnsNoAnswer when the server is an ordinary host', () => {
    const state = editHost(officeLab(), 'pc1', { dnsServers: ['192.168.1.150'] })
    expect(engine.resolve(state, 'pc1', 'google.com')).toEqual({
      ok: false,
      reason: 'dnsNoAnswer',
      dnsServer: '192.168.1.150',
    })
  })

  it('fails with dnsUnreachable when the only server does not exist', () => {
    const state = editHost(officeLab(), 'pc1', { dnsServers: ['192.168.1.254'] })
    expect(engine.resolve(state, 'pc1', 'google.com')).toEqual({
      ok: false,
      reason: 'dnsUnreachable',
      dnsServer: '192.168.1.254',
    })
  })

  it('falls back to the second server', () => {
    const state = editHost(officeLab(), 'pc1', { dnsServers: ['192.168.1.254', '1.1.1.1'] })
    expect(engine.resolve(state, 'pc1', 'google.com')).toMatchObject({ ok: true, dnsServer: '1.1.1.1' })
  })

  it('treats a public address that is not a resolver as a timeout', () => {
    const state = editHost(officeLab(), 'pc1', { dnsServers: ['4.4.4.4'] })
    expect(engine.resolve(state, 'pc1', 'google.com')).toMatchObject({ ok: false, reason: 'dnsUnreachable' })
  })

  it('cannot resolve without a working network path', () => {
    const state = editHost(officeLab(), 'pc1', { defaultGateway: '' })
    expect(engine.resolve(state, 'pc1', 'google.com')).toMatchObject({ ok: false, reason: 'dnsUnreachable' })
  })
})

describe('DnsResolver — unusable own address', () => {
  it('fails with ipConflict when the own address is duplicate', () => {
    const state = editNic(officeLab(), 'printer', { address: '192.168.1.20' })
    expect(engine.resolve(state, 'pc1', 'google.com')).toEqual({ ok: false, reason: 'ipConflict', dnsServer: '8.8.8.8' })
  })

  it('fails with invalidHostAddress for a broadcast address', () => {
    const state = editNic(officeLab(), 'pc1', { address: '192.168.1.255' })
    expect(engine.resolve(state, 'pc1', 'google.com')).toMatchObject({ ok: false, reason: 'invalidHostAddress' })
  })

  it('uses an address as is and resolves names for ping targets', () => {
    expect(resolver.resolveTarget(officeLab(), 'pc1', '10.1.2.3')).toEqual({ ok: true, ip: '10.1.2.3', name: null })
    expect(resolver.resolveTarget(officeLab(), 'pc1', 'google.com')).toEqual({ ok: true, ip: '142.250.187.206', name: 'google.com' })
    expect(resolver.resolveTarget(officeLab(), 'pc1', 'yok.example')).toEqual({ ok: false })
  })
})
