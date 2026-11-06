import { describe, expect, it } from 'vitest'
import type { DhcpPool } from '../domain'
import { DhcpPoolAllocator } from './DhcpPoolAllocator'

const MAC = '02:00:00:00:AA:01'
const OTHER = '02:00:00:00:AA:02'

function pool(network: string, mask: string, patch: Partial<DhcpPool> = {}): DhcpPool {
  return { id: 'p', network, mask, defaultRouter: '', dnsServers: [], leases: [], ...patch }
}

const none = new Set<string>()

describe('DhcpPoolAllocator', () => {
  it('skips the network address, exclusions, used addresses and other leases', () => {
    const p = pool('10.0.0.0', '255.255.255.0', { leases: [{ mac: OTHER, ip: '10.0.0.5' }] })
    const excluded = [{ start: '10.0.0.1', end: '10.0.0.3' }]
    expect(DhcpPoolAllocator.pick(p, MAC, new Set(['10.0.0.4']), excluded)).toBe('10.0.0.6')
  })

  it('handles overlapping and unsorted exclusions', () => {
    const p = pool('10.0.0.0', '255.255.255.0')
    const excluded = [
      { start: '10.0.0.20', end: '10.0.0.30' },
      { start: '10.0.0.1', end: '10.0.0.10' },
      { start: '10.0.0.5', end: '10.0.0.25' },
    ]
    expect(DhcpPoolAllocator.pick(p, MAC, new Set(['10.0.0.31']), excluded)).toBe('10.0.0.32')
  })

  it('ignores malformed and reversed exclusions', () => {
    const p = pool('10.0.0.0', '255.255.255.0')
    const excluded = [
      { start: 'x', end: '10.0.0.9' },
      { start: '10.0.0.9', end: '10.0.0.1' },
    ]
    expect(DhcpPoolAllocator.pick(p, MAC, none, excluded)).toBe('10.0.0.1')
  })

  it('returns null when everything is taken (and never offers the broadcast address)', () => {
    const p = pool('10.0.0.0', '255.255.255.252')
    expect(DhcpPoolAllocator.pick(p, MAC, new Set(['10.0.0.1', '10.0.0.2']), [])).toBeNull()
  })

  it('finds the last address of a fully excluded /8 quickly', () => {
    const p = pool('10.0.0.0', '255.0.0.0')
    const excluded = [{ start: '10.0.0.1', end: '10.255.255.253' }]
    const started = performance.now()
    for (let round = 0; round < 10; round += 1) {
      expect(DhcpPoolAllocator.pick(p, MAC, none, excluded)).toBe('10.255.255.254')
    }
    expect((performance.now() - started) / 10).toBeLessThan(50)
  })

  it('handles a /0 and a /1 pool without scanning them', () => {
    const started = performance.now()
    const everything = pool('0.0.0.0', '0.0.0.0')
    expect(DhcpPoolAllocator.pick(everything, MAC, none, [{ start: '0.0.0.1', end: '255.255.255.253' }])).toBe('255.255.255.254')
    expect(DhcpPoolAllocator.pick(everything, MAC, none, [{ start: '0.0.0.0', end: '255.255.255.255' }])).toBeNull()
    const half = pool('128.0.0.0', '128.0.0.0', { leases: [{ mac: OTHER, ip: '128.0.0.1' }] })
    expect(DhcpPoolAllocator.pick(half, MAC, none, [{ start: '128.0.0.2', end: '254.0.0.0' }])).toBe('254.0.0.1')
    expect(performance.now() - started).toBeLessThan(50)
  })

  describe('existing lease', () => {
    const leased = (ip: string, extra: Partial<DhcpPool> = {}) =>
      pool('10.0.0.0', '255.255.255.0', { range: { start: '10.0.0.100', end: '10.0.0.200' }, leases: [{ mac: MAC.toLowerCase(), ip }], ...extra })

    it('is reused while still valid', () => {
      expect(DhcpPoolAllocator.pick(leased('10.0.0.150'), MAC, none, [])).toBe('10.0.0.150')
    })

    it('is not reused outside the pool network or the range', () => {
      expect(DhcpPoolAllocator.pick(leased('192.168.1.150'), MAC, none, [])).toBe('10.0.0.100')
      expect(DhcpPoolAllocator.pick(leased('10.0.0.50'), MAC, none, [])).toBe('10.0.0.100')
      expect(DhcpPoolAllocator.pick(leased('not-an-ip'), MAC, none, [])).toBe('10.0.0.100')
    })

    it('is not reused when excluded, used by another device or leased to another MAC', () => {
      const lease = leased('10.0.0.150')
      expect(DhcpPoolAllocator.pick(lease, MAC, none, [{ start: '10.0.0.150', end: '10.0.0.150' }])).toBe('10.0.0.100')
      expect(DhcpPoolAllocator.pick(lease, MAC, new Set(['10.0.0.150']), [])).toBe('10.0.0.100')
      const shared = leased('10.0.0.150', { leases: [{ mac: OTHER, ip: '10.0.0.150' }, { mac: MAC, ip: '10.0.0.150' }] })
      expect(DhcpPoolAllocator.pick(shared, MAC, none, [])).toBe('10.0.0.100')
    })
  })
})
