import { describe, expect, it } from 'vitest'
import type { FailureReason, NetworkState } from '../../domain'
import { networkEngine } from '../../engine'
import { editHost, editLink } from '../../engine/testLabs'
import { editNic, officeLab, vlanLab } from '../../engine/testNetworks'
import { createSimulation } from '../createSimulation'
import { internetLab, ping, staticRoute, tracert, twoRouterLab } from '../l3/l3TestLabs'
import { SimAppLinks, SimProbes } from './index'

interface ReasonCase {
  readonly name: string
  readonly lab: NetworkState
  readonly from: string
  readonly to: string
  readonly reason: FailureReason
}

/** One lab per engine reason; the simulator derives it from the echo's drop / decision events (decision 9). */
const CASES: readonly ReasonCase[] = [
  { name: 'unplugged NIC', lab: editLink(twoRouterLab(), 'l1', (link) => ({ ...link, connected: false })), from: 'pc1', to: '10.0.2.10', reason: 'cableDisconnected' },
  { name: 'no gateway', lab: editHost(twoRouterLab(), 'pc1', { defaultGateway: '' }), from: 'pc1', to: '10.0.2.10', reason: 'gatewayNotSet' },
  { name: 'gateway outside the subnet', lab: editHost(twoRouterLab(), 'pc1', { defaultGateway: '10.0.9.1' }), from: 'pc1', to: '10.0.2.10', reason: 'gatewayOutsideSubnet' },
  { name: 'nobody at the gateway address', lab: editHost(twoRouterLab(), 'pc1', { defaultGateway: '10.0.1.99' }), from: 'pc1', to: '10.0.2.10', reason: 'gatewayUnreachable' },
  { name: 'nobody at a local address', lab: twoRouterLab(), from: 'pc1', to: '10.0.1.99', reason: 'destinationNotInSegment' },
  { name: 'nobody at an address behind a router', lab: twoRouterLab(), from: 'pc1', to: '10.0.2.99', reason: 'destinationNotInSegment' },
  { name: 'echo to the subnet broadcast (nobody answers)', lab: twoRouterLab(), from: 'pc1', to: '10.0.1.255', reason: 'destinationNotInSegment' },
  { name: 'router without a route (private)', lab: twoRouterLab(), from: 'pc1', to: '10.5.5.5', reason: 'noRouteToDestination' },
  { name: 'reply without a way back', lab: twoRouterLab({ r2: [] }), from: 'pc1', to: '10.0.2.10', reason: 'gatewayUnreachable' },
  {
    name: 'routing loop',
    lab: twoRouterLab({ r1: [staticRoute('0.0.0.0', '0.0.0.0', '10.0.12.2')], r2: [staticRoute('0.0.0.0', '0.0.0.0', '10.0.12.1')] }),
    from: 'pc1',
    to: '10.9.9.9',
    reason: 'ttlExpired',
  },
  { name: 'private destination toward the cloud', lab: internetLab(), from: 'pc', to: '10.50.0.1', reason: 'noRouteToDestination' },
  { name: 'no default route to the internet', lab: internetLab({ defaultRoute: false }), from: 'pc', to: '8.8.8.8', reason: 'wanDown' },
  { name: 'provider outage', lab: internetLab({ serviceUp: false }), from: 'pc', to: '8.8.8.8', reason: 'wanDown' },
  {
    name: 'Wi-Fi client on an SSID the AP does not offer',
    lab: editLink(vlanLab(), 'phoneLink', (link) => ({ ...link, ssid: 'Yok' })),
    from: 'phone',
    to: '192.168.20.50',
    reason: 'cableDisconnected',
  },
]

describe('SimProbes failure reasons (coordinator decision 9: equal to the rule engine)', () => {
  it.each(CASES.map((testCase) => [testCase.name, testCase] as const))('%s', (_name, testCase) => {
    const reach = SimProbes.reach(createSimulation(testCase.lab), testCase.from, testCase.to).result
    expect(reach).toMatchObject({ ok: false, reason: testCase.reason })
    expect(networkEngine.reach(testCase.lab, testCase.from, testCase.to)).toMatchObject({ ok: false, reason: testCase.reason })
  })

  it('a duplicate address and the provider outage reach the app links with the engine reasons', () => {
    const conflict = editNic(officeLab(), 'printer', { address: '192.168.1.20' })
    for (const state of [conflict, editNic(officeLab(), 'printer', { address: '192.168.1.151' })]) {
      expect(SimAppLinks.status(createSimulation(state), 'pc1')).toEqual(networkEngine.appLinkStatus(state, 'pc1'))
    }
    const outage = internetLab({ serviceUp: false })
    const withLink = editHost(outage, 'pc', { appLinks: [{ id: 'web', label: 'web', targetIp: '8.8.8.8', targetKind: 'internet' }] })
    expect(SimAppLinks.status(createSimulation(withLink), 'pc')).toEqual([expect.objectContaining({ ok: false, reason: 'wanDown' })])
    expect(SimAppLinks.status(createSimulation(withLink), 'pc')).toEqual(networkEngine.appLinkStatus(withLink, 'pc'))
  })

  it('uses the NIC mask to tell an on-link destination from one behind the gateway', () => {
    const lab = editNic(twoRouterLab(), 'pc1', { mask: '255.255.0.0' })
    expect(SimProbes.reach(createSimulation(lab), 'pc1', '10.0.200.1').result).toMatchObject({ reason: 'destinationNotInSegment' })
  })
})

describe('provider outage on the full stack (coordinator decision 1: silence, as the engine)', () => {
  it('the cloud answers ARP and drops IPv4: ping times out, tracert shows the router then silence', () => {
    const engine = createSimulation(internetLab({ serviceUp: false }))
    const pingId = engine.inject(ping('pc', '8.8.8.8'))
    engine.runUntilDone(pingId)
    expect(engine.request(pingId)?.result).toMatchObject({ echoes: [{ kind: 'timeout' }] })
    const atCloud = engine.events().filter((event) => event.deviceId === 'internet')
    expect(atCloud.some((event) => event.protocol === 'arp' && event.action === 'replied')).toBe(true)
    expect(atCloud.find((event) => event.protocol === 'icmp')).toMatchObject({ action: 'dropped', reason: 'ispServiceDown' })
    expect(engine.events().some((event) => event.deviceId === 'router' && event.action === 'dropped' && event.reason === 'arpTimeout')).toBe(false)

    const traceId = engine.inject(tracert('pc', '8.8.8.8'))
    engine.runUntilDone(traceId)
    const trace = engine.request(traceId)?.result
    if (trace?.kind !== 'tracert') throw new Error('no tracert result')
    expect(trace.hops[0]?.probes.every((probe) => probe.kind === 'timeExceeded' && probe.fromIp === '192.168.1.1')).toBe(true)
    expect(trace.hops.slice(1).every((hop) => hop.probes.every((probe) => probe.kind === 'timeout'))).toBe(true)
    expect(trace.ending).toEqual({ kind: 'silent' })
  })
})
