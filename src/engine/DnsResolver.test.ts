import { describe, expect, it } from 'vitest'
import { DnsResolver } from './DnsResolver'
import { ReachabilityChecker } from './ReachabilityChecker'
import { SegmentFinder } from './SegmentFinder'
import { officeNetwork, updateDevice, updateHost } from './testFixtures'

const resolver = new DnsResolver(new ReachabilityChecker(new SegmentFinder()))

describe('DnsResolver', () => {
  it('resolves a known name through a public DNS server', () => {
    expect(resolver.resolve(officeNetwork(), 'pc1', 'google.com')).toEqual({
      ok: true,
      ip: '142.250.187.206',
      dnsServer: '8.8.8.8',
    })
  })

  it('normalises case and a trailing dot', () => {
    expect(resolver.resolve(officeNetwork(), 'pc1', 'ODEME.ornekbanka.com.tr.')).toMatchObject({ ok: true, ip: '203.0.113.10' })
  })

  it('fails with dnsNotSet when no server is configured', () => {
    const state = updateHost(officeNetwork(), 'pc1', { dns: [] })
    expect(resolver.resolve(state, 'pc1', 'google.com')).toEqual({ ok: false, reason: 'dnsNotSet' })
  })

  it('fails with nameNotFound for an unknown name', () => {
    expect(resolver.resolve(officeNetwork(), 'pc1', 'yok.example')).toEqual({
      ok: false,
      reason: 'nameNotFound',
      dnsServer: '8.8.8.8',
    })
  })

  it('uses router DNS forwarding when the WAN is up', () => {
    expect(resolver.resolve(officeNetwork(), 'pc2', 'google.com')).toMatchObject({ ok: true, dnsServer: '192.168.1.1' })
  })

  it('times out on a forwarder whose WAN is down', () => {
    const state = updateDevice(officeNetwork(), 'router', (router) => ({ ...router, wanUp: false }))
    expect(resolver.resolve(state, 'pc2', 'google.com')).toEqual({
      ok: false,
      reason: 'dnsUnreachable',
      dnsServer: '192.168.1.1',
    })
  })

  it('fails with dnsNoAnswer when the router answers ping but does not forward DNS', () => {
    const state = updateDevice(officeNetwork(), 'router', (router) => ({ ...router, dnsForwarding: false }))
    expect(resolver.resolve(state, 'pc2', 'google.com')).toMatchObject({ ok: false, reason: 'dnsNoAnswer' })
  })

  it('fails with dnsNoAnswer when the server is an ordinary host', () => {
    const state = updateHost(officeNetwork(), 'pc1', { dns: ['192.168.1.150'] })
    expect(resolver.resolve(state, 'pc1', 'google.com')).toEqual({
      ok: false,
      reason: 'dnsNoAnswer',
      dnsServer: '192.168.1.150',
    })
  })

  it('fails with dnsUnreachable when the only server does not exist', () => {
    const state = updateHost(officeNetwork(), 'pc1', { dns: ['192.168.1.254'] })
    expect(resolver.resolve(state, 'pc1', 'google.com')).toEqual({
      ok: false,
      reason: 'dnsUnreachable',
      dnsServer: '192.168.1.254',
    })
  })

  it('falls back to the second server', () => {
    const state = updateHost(officeNetwork(), 'pc1', { dns: ['192.168.1.254', '1.1.1.1'] })
    expect(resolver.resolve(state, 'pc1', 'google.com')).toMatchObject({ ok: true, dnsServer: '1.1.1.1' })
  })

  it('treats a public address that is not a resolver as a timeout', () => {
    const state = updateHost(officeNetwork(), 'pc1', { dns: ['4.4.4.4'] })
    expect(resolver.resolve(state, 'pc1', 'google.com')).toMatchObject({ ok: false, reason: 'dnsUnreachable' })
  })

  it('cannot resolve without a working network path', () => {
    const state = updateHost(officeNetwork(), 'pc1', { gateway: '' })
    expect(resolver.resolve(state, 'pc1', 'google.com')).toMatchObject({ ok: false, reason: 'dnsUnreachable' })
  })
})
