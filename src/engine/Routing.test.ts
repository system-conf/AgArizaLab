import { describe, expect, it } from 'vitest'
import type { NetworkState, StaticRoute } from '../domain'
import { DefaultNetworkEngine } from './DefaultNetworkEngine'
import { editDevice, editLink, labHost, labLink, labRouter, textOf } from './testLabs'

const engine = new DefaultNetworkEngine()
const CROSS = { cable: 'copperCross' } as const
const P2P = '255.255.255.252'

function via(prefix: string, mask: string, nextHop: string, adminDistance = 1): StaticRoute {
  return { prefix, mask, nextHop, adminDistance }
}

/**
 * pcA 10.1.1.10 — r1 — r2 — pcB 10.2.2.10, plus r3 behind r1 (10.0.13.0/30).
 * r1: 10.2.2.0/24 via r2; r2: 10.1.1.0/24 via r1; r3: `r3Routes` (none by default).
 */
function twoRouters(
  r1Routes: StaticRoute[] = [via('10.2.2.0', '255.255.255.0', '10.0.12.2')],
  r2Routes = [via('10.1.1.0', '255.255.255.0', '10.0.12.1')],
  r3Routes: StaticRoute[] = [],
): NetworkState {
  return {
    devices: [
      labHost('pcA', '10.1.1.10', { gateway: '10.1.1.1' }),
      labRouter(
        'r1',
        [
          { id: 'Gi0/0', ip: '10.1.1.1' },
          { id: 'Gi0/1', ip: '10.0.12.1', mask: P2P },
          { id: 'Gi0/2', ip: '10.0.13.1', mask: P2P },
        ],
        r1Routes,
      ),
      labRouter('r2', [{ id: 'Gi0/0', ip: '10.2.2.1' }, { id: 'Gi0/1', ip: '10.0.12.2', mask: P2P }], r2Routes),
      labRouter('r3', [{ id: 'Gi0/0', ip: '10.0.13.2', mask: P2P }], r3Routes),
      labHost('pcB', '10.2.2.10', { gateway: '10.2.2.1' }),
    ],
    links: [
      labLink('aToR1', ['pcA', 'eth0'], ['r1', 'Gi0/0'], CROSS),
      labLink('r1ToR2', ['r1', 'Gi0/1'], ['r2', 'Gi0/1'], CROSS),
      labLink('r1ToR3', ['r1', 'Gi0/2'], ['r3', 'Gi0/0'], CROSS),
      labLink('r2ToB', ['r2', 'Gi0/0'], ['pcB', 'eth0'], CROSS),
    ],
  }
}

function hopLines(lines: string[]): string[] {
  return lines.filter((line) => /^ {2}\d|^ \d\d/.test(line))
}

describe('static routing over several routers', () => {
  it('reaches a host two routers away and back', () => {
    expect(engine.reach(twoRouters(), 'pcA', '10.2.2.10')).toEqual({ ok: true, path: ['pcA', 'r1', 'r2', 'pcB'] })
    expect(engine.reach(twoRouters(), 'pcB', '10.1.1.10')).toEqual({ ok: true, path: ['pcB', 'r2', 'r1', 'pcA'] })
  })

  it('answers with a TTL lowered once per router', () => {
    const output = textOf(engine.runCommand(twoRouters(), 'pcA', 'ping 10.2.2.10').lines)
    expect(output).toContain('Reply from 10.2.2.10: bytes=32 time=3ms TTL=126')
  })

  it('reaches the far interface of the next router', () => {
    expect(engine.reach(twoRouters(), 'pcA', '10.0.12.2')).toEqual({ ok: true, path: ['pcA', 'r1', 'r2'] })
    expect(engine.reach(twoRouters(), 'pcA', '10.2.2.1')).toEqual({ ok: true, path: ['pcA', 'r1', 'r2'] })
  })

  it('fails at the first router without a route', () => {
    const state = twoRouters([])
    expect(engine.reach(state, 'pcA', '10.2.2.10')).toEqual({ ok: false, reason: 'noRouteToDestination', atDeviceId: 'r1' })
    expect(textOf(engine.runCommand(state, 'pcA', 'ping 10.2.2.10').lines)).toContain('Reply from 10.1.1.1: Destination host unreachable.')
  })

  it('needs a route back: the destination host cannot answer otherwise', () => {
    const state = twoRouters(undefined, [])
    expect(engine.reach(state, 'pcA', '10.2.2.10')).toEqual({ ok: false, reason: 'gatewayUnreachable', atDeviceId: 'pcB' })
    // r2's "TTL expired" has no way back either: its hop is silent too.
    const lines = textOf(engine.runCommand(state, 'pcA', 'tracert 10.2.2.10').lines)
    expect(hopLines(lines).slice(0, 3)).toEqual([
      '  1    <1 ms    <1 ms    <1 ms  10.1.1.1',
      '  2     *        *        *     Request timed out.',
      '  3     *        *        *     Request timed out.',
    ])
  })

  it('loses the ICMP error of a router without a route back to the sender', () => {
    const state = twoRouters([via('10.0.0.0', '255.0.0.0', '10.0.13.2')])
    // r3 has no route for 10.5.5.5 and none back to pcA: the "unreachable" never arrives.
    expect(engine.reach(state, 'pcA', '10.5.5.5')).toEqual({ ok: false, reason: 'noRouteToDestination', atDeviceId: 'r3' })
    expect(textOf(engine.runCommand(state, 'pcA', 'ping 10.5.5.5').lines)).toContain('Request timed out.')
    const withWayBack = twoRouters([via('10.0.0.0', '255.0.0.0', '10.0.13.2')], undefined, [via('10.1.1.0', '255.255.255.0', '10.0.13.1')])
    expect(textOf(engine.runCommand(withWayBack, 'pcA', 'ping 10.5.5.5').lines)).toContain('Reply from 10.0.13.2: Destination host unreachable.')
  })

  it('ignores a static route whose next hop is one of the router own addresses', () => {
    const state = twoRouters([via('10.2.2.0', '255.255.255.0', '10.0.12.1'), via('10.2.2.0', '255.255.255.0', '10.0.12.2', 5)])
    // IOS refuses the first route ("Invalid next hop address"), so the floating one is used.
    expect(engine.reach(state, 'pcA', '10.2.2.10')).toEqual({ ok: true, path: ['pcA', 'r1', 'r2', 'pcB'] })
    const onlyOwn = twoRouters([{ prefix: '10.2.2.0', mask: '255.255.255.0', exitInterfaceId: 'Gi0/1', nextHop: '10.1.1.1', adminDistance: 1 }])
    expect(engine.reach(onlyOwn, 'pcA', '10.2.2.10')).toEqual({ ok: false, reason: 'noRouteToDestination', atDeviceId: 'r1' })
  })

  it('works with an exit-interface-only static route', () => {
    const state = twoRouters([{ prefix: '10.2.2.0', mask: '255.255.255.0', exitInterfaceId: 'Gi0/1', adminDistance: 1 }])
    // Without a next hop the router ARPs for the destination on Gi0/1, where nobody owns it.
    expect(engine.reach(state, 'pcA', '10.2.2.10')).toEqual({ ok: false, reason: 'destinationNotInSegment', atDeviceId: 'r1' })
    const withNextHop = twoRouters([{ prefix: '10.2.2.0', mask: '255.255.255.0', exitInterfaceId: 'Gi0/1', nextHop: '10.0.12.2', adminDistance: 1 }])
    expect(engine.reach(withNextHop, 'pcA', '10.2.2.10')).toMatchObject({ ok: true })
  })

  it('ignores a route whose next hop does not resolve', () => {
    const state = twoRouters([via('10.2.2.0', '255.255.255.0', '172.16.0.1')])
    expect(engine.reach(state, 'pcA', '10.2.2.10')).toEqual({ ok: false, reason: 'noRouteToDestination', atDeviceId: 'r1' })
  })
})

describe('route selection', () => {
  it('prefers the longest prefix over a default and a shorter route', () => {
    const state = twoRouters(
      [via('0.0.0.0', '0.0.0.0', '10.0.13.2'), via('10.0.0.0', '255.0.0.0', '10.0.13.2'), via('10.2.2.0', '255.255.255.0', '10.0.12.2')],
      undefined,
      [via('10.1.1.0', '255.255.255.0', '10.0.13.1')],
    )
    expect(engine.reach(state, 'pcA', '10.2.2.10')).toEqual({ ok: true, path: ['pcA', 'r1', 'r2', 'pcB'] })
    // Anything else in 10/8 follows the shorter route to r3, which has no route for it.
    expect(engine.reach(state, 'pcA', '10.5.5.5')).toEqual({ ok: false, reason: 'noRouteToDestination', atDeviceId: 'r3' })
    expect(hopLines(textOf(engine.runCommand(state, 'pcA', 'tracert 10.5.5.5').lines))).toEqual([
      '  1    <1 ms    <1 ms    <1 ms  10.1.1.1',
      '  2  10.0.13.2  reports: Destination host unreachable.',
    ])
  })

  it('breaks a tie of equal prefixes by administrative distance', () => {
    const state = twoRouters([via('10.2.2.0', '255.255.255.0', '10.0.13.2', 5), via('10.2.2.0', '255.255.255.0', '10.0.12.2', 1)])
    expect(engine.reach(state, 'pcA', '10.2.2.10')).toMatchObject({ ok: true, path: ['pcA', 'r1', 'r2', 'pcB'] })
  })

  it('falls back to the floating route when the preferred link goes down', () => {
    const state = twoRouters([via('10.2.2.0', '255.255.255.0', '10.0.13.2', 5), via('10.2.2.0', '255.255.255.0', '10.0.12.2', 1)])
    const unplugged = editLink(state, 'r1ToR2', (link) => ({ ...link, connected: false }))
    expect(engine.reach(unplugged, 'pcA', '10.2.2.10')).toEqual({ ok: false, reason: 'noRouteToDestination', atDeviceId: 'r3' })
  })
})

describe('routing loops', () => {
  const loop = (): NetworkState =>
    twoRouters([via('10.9.0.0', '255.255.0.0', '10.0.12.2')], [via('10.9.0.0', '255.255.0.0', '10.0.12.1'), via('10.1.1.0', '255.255.255.0', '10.0.12.1')])

  it('ends with ttlExpired at the router where the TTL runs out', () => {
    // Hop n (0-based) gets TTL 128 - n: hop 127 is r2 (odd hops alternate r2, r1).
    expect(engine.reach(loop(), 'pcA', '10.9.1.1')).toEqual({ ok: false, reason: 'ttlExpired', atDeviceId: 'r2' })
  })

  it('shows "TTL expired in transit" in ping', () => {
    const result = engine.runCommand(loop(), 'pcA', 'ping 10.9.1.1')
    const output = textOf(result.lines)
    expect(output.filter((line) => line === 'Reply from 10.0.12.2: TTL expired in transit.')).toHaveLength(4)
    expect(output).toContain('    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),')
    expect(result.trace).toEqual({ ok: false, path: ['pcA', 'r1', 'r2', 'r1', 'r2'] })
  })

  it('shows the loop in tracert up to the hop limit', () => {
    const hops = hopLines(textOf(engine.runCommand(loop(), 'pcA', 'tracert 10.9.1.1').lines))
    expect(hops).toHaveLength(30)
    expect(hops.slice(0, 4)).toEqual([
      '  1    <1 ms    <1 ms    <1 ms  10.1.1.1',
      '  2     1 ms     2 ms     1 ms  10.0.12.2',
      '  3     2 ms     3 ms     2 ms  10.0.12.1',
      '  4     3 ms     4 ms     3 ms  10.0.12.2',
    ])
    expect(hops[29]).toMatch(/^ 30 .* 10\.0\.12\.2$/)
  })

  it('also detects a loop for a router sender', () => {
    expect(engine.reach(loop(), 'r1', '10.9.1.1')).toMatchObject({ ok: false, reason: 'ttlExpired' })
  })
})

describe('tracert through two routers', () => {
  it('lists both routers by the address the probe arrived on, then the destination', () => {
    const result = engine.runCommand(twoRouters(), 'pcA', 'tracert 10.2.2.10')
    expect(textOf(result.lines)).toEqual([
      '',
      'Tracing route to 10.2.2.10 over a maximum of 30 hops',
      '',
      '  1    <1 ms    <1 ms    <1 ms  10.1.1.1',
      '  2     1 ms     2 ms     1 ms  10.0.12.2',
      '  3     3 ms     4 ms     3 ms  10.2.2.10',
      '',
      'Trace complete.',
    ])
    expect(result.trace).toEqual({ ok: true, path: ['pcA', 'r1', 'r2', 'pcB'] })
  })

  it('does not list the destination router as a forwarding hop', () => {
    expect(hopLines(textOf(engine.runCommand(twoRouters(), 'pcA', 'tracert 10.2.2.1').lines))).toEqual([
      '  1    <1 ms    <1 ms    <1 ms  10.1.1.1',
      '  2     2 ms     3 ms     2 ms  10.2.2.1',
    ])
  })

  it('stops at a powered-off router', () => {
    const state = editDevice(twoRouters(), 'r2', (device) => ({ ...device, powered: false }))
    expect(engine.reach(state, 'pcA', '10.2.2.10')).toEqual({ ok: false, reason: 'noRouteToDestination', atDeviceId: 'r1' })
  })
})
