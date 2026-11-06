import { describe, expect, it } from 'vitest'
import type { NetworkState } from '../../domain'
import type { EchoResult, SimEvent, SimRequest } from '../contract'
import type { SimulationKernel } from '../core'
import { l3Engine } from './l3TestLayers'
import { internetLab, l3SwitchLab, ping, staticRoute, stickLab, twoRouterLab } from './l3TestLabs'

function run(state: NetworkState, request: SimRequest): { engine: SimulationKernel; id: string } {
  const { engine } = l3Engine(state)
  const id = engine.inject(request)
  engine.runUntilDone(id)
  return { engine, id }
}

function echoes(engine: SimulationKernel, id: string): readonly EchoResult[] {
  const result = engine.request(id)?.result
  if (result?.kind !== 'ping') throw new Error(`no ping result for ${id}`)
  return result.echoes
}

function eventsOf(engine: SimulationKernel, pduId: string): SimEvent[] {
  return engine.events().filter((event) => event.pduId === pduId)
}

/** Devices that routed the echo request (§10.1: events with the request's PDU, forwarded at layer 3). */
function routers(engine: SimulationKernel, echo: EchoResult): string[] {
  if (echo.kind === 'localFailure') return []
  return eventsOf(engine, echo.requestPduId).filter((event) => event.action === 'forwarded' && event.layer === 3).map((event) => event.deviceId)
}

function noteKeys(event: SimEvent | undefined): string[] {
  return event?.notes.map((note) => note.message.key.replace('simulation:notes.', '')) ?? []
}

describe('network layer: forwarding and ICMP', () => {
  it('pings across two routers: each router decrements the TTL once', () => {
    const { engine, id } = run(twoRouterLab(), ping('pc1', '10.0.2.10'))
    const [echo] = echoes(engine, id)
    expect(echo).toMatchObject({ kind: 'reply', sequence: 1, fromIp: '10.0.2.10', ttl: 126, bytes: 32 })
    if (!echo || echo.kind !== 'reply') throw new Error('expected a reply')
    expect(routers(engine, echo)).toEqual(['r1', 'r2'])
    const atR1 = eventsOf(engine, echo.requestPduId).find((event) => event.deviceId === 'r1')
    expect(noteKeys(atR1)).toEqual(['l3.packetReceived', 'l3.routeFound', 'l3.ttlDecremented'])
    expect(atR1?.notes[1]?.message.params).toEqual({ dst: '10.0.2.10', prefix: '10.0.2.0', length: 24, via: '10.0.12.2', iface: 'Gi0/1' })
    const path = eventsOf(engine, echo.requestPduId).map((event) => event.deviceId)
    expect(path).toEqual(['pc1', 'sw1', 'r1', 'r2', 'pc2'])
  })

  it('answers with the request in sequence, the next echo 1000 ms after each reply', () => {
    const { engine, id } = run(twoRouterLab(), ping('pc1', '10.0.2.10', 3))
    const list = echoes(engine, id)
    expect(list.map((echo) => [echo.kind, echo.sequence])).toEqual([['reply', 1], ['reply', 2], ['reply', 3]])
    const sentAt = engine.events().filter((event) => event.deviceId === 'pc1' && event.action === 'created').map((event) => event.time)
    expect(sentAt).toEqual([0, 1008, 2016])
    expect(list.every((echo) => echo.kind === 'reply' && echo.rttMs === 8)).toBe(true)
    expect(engine.runtime('pc1')?.network.sessions).toEqual([])
  })

  it('routers answer echo requests with TTL 255 from the address that was pinged', () => {
    const { engine, id } = run(twoRouterLab(), ping('pc1', '10.0.12.2'))
    expect(echoes(engine, id)).toEqual([expect.objectContaining({ kind: 'reply', fromIp: '10.0.12.2', ttl: 254 })])
  })

  it('no route to a private destination: the router answers host unreachable from its ingress interface', () => {
    const { engine, id } = run(twoRouterLab(), ping('pc1', '10.5.5.5'))
    expect(echoes(engine, id)).toEqual([expect.objectContaining({ kind: 'unreachable', fromIp: '10.0.1.1', code: 'host' })])
    const drop = engine.events().find((event) => event.deviceId === 'r1' && event.action === 'dropped')
    expect(drop).toMatchObject({ reason: 'noRoute', layer: 3 })
    const error = engine.events().find((event) => event.deviceId === 'r1' && event.causeEventId === drop?.id)
    expect(noteKeys(error)).toContain('l3.unreachableSent')
  })

  it('no route to a public destination: silent drop, the ping times out (engine "WAN down")', () => {
    const { engine, id } = run(twoRouterLab(), ping('pc1', '8.8.8.8', 2))
    expect(echoes(engine, id).map((echo) => echo.kind)).toEqual(['timeout', 'timeout'])
    expect(engine.events().find((event) => event.deviceId === 'r1' && event.action === 'dropped')).toMatchObject({ reason: 'noRoute' })
    const timeouts = engine.events().filter((event) => event.action === 'timedOut')
    expect(timeouts.map((event) => [event.time, event.reason])).toEqual([[4000, 'requestTimedOut'], [8000, 'requestTimedOut']])
  })

  it('ARP failure for a connected destination: ICMP host unreachable from the ingress interface', () => {
    const { engine, id } = run(twoRouterLab(), ping('pc1', '10.0.2.99'))
    expect(echoes(engine, id)).toEqual([expect.objectContaining({ kind: 'unreachable', fromIp: '10.0.12.2', code: 'host' })])
    expect(engine.request(id)?.finishedAt).toBeLessThan(4000)
  })

  it("the sender's own ARP failure: unreachable from its own address", () => {
    const { engine, id } = run(twoRouterLab(), ping('pc1', '10.0.1.99'))
    expect(echoes(engine, id)).toEqual([expect.objectContaining({ kind: 'unreachable', fromIp: '10.0.1.10', code: 'host' })])
  })

  it('a routing loop ends with time exceeded where the TTL reaches 0 (the rule engine names the same router)', () => {
    const lab = twoRouterLab({ r1: [staticRoute('0.0.0.0', '0.0.0.0', '10.0.12.2')], r2: [staticRoute('0.0.0.0', '0.0.0.0', '10.0.12.1')] })
    const { engine, id } = run(lab, ping('pc1', '10.9.9.9'))
    expect(echoes(engine, id)).toEqual([expect.objectContaining({ kind: 'ttlExpired', fromIp: '10.0.12.2' })])
    const expired = engine.events().find((event) => event.reason === 'ttlExpired')
    expect(expired).toMatchObject({ deviceId: 'r2', action: 'dropped', layer: 3 })
    expect(noteKeys(expired)).toContain('l3.ttlExpired')
  })

  it('reaches the internet: the cloud answers with TTL 118, 117 after one router', () => {
    const { engine, id } = run(internetLab(), ping('pc', '8.8.8.8'))
    const [echo] = echoes(engine, id)
    expect(echo).toMatchObject({ kind: 'reply', fromIp: '8.8.8.8', ttl: 117 })
    const atCloud = engine.events().find((event) => event.deviceId === 'internet')
    expect(atCloud).toMatchObject({ action: 'replied', layer: 3 })
  })

  it('never sends a private destination to the cloud: host unreachable from the router (lab rule)', () => {
    const { engine, id } = run(internetLab(), ping('pc', '10.50.0.1'))
    expect(echoes(engine, id)).toEqual([expect.objectContaining({ kind: 'unreachable', fromIp: '192.168.1.1' })])
    expect(engine.events().find((event) => event.deviceId === 'router' && event.action === 'dropped')).toMatchObject({ reason: 'privateToInternet' })
    expect(engine.events().some((event) => event.deviceId === 'internet')).toBe(false)
  })

  it('provider outage or no default route: the ping times out', () => {
    for (const lab of [internetLab({ serviceUp: false }), internetLab({ defaultRoute: false })]) {
      const { engine, id } = run(lab, ping('pc', '8.8.8.8'))
      expect(echoes(engine, id).map((echo) => echo.kind)).toEqual(['timeout'])
    }
  })

  it('routes between VLANs on a stick and on an L3 switch', () => {
    for (const [lab, routerId] of [[stickLab(), 'router'], [l3SwitchLab(), 'core']] as const) {
      const { engine, id } = run(lab, ping('pc10', '192.168.20.10'))
      const [echo] = echoes(engine, id)
      expect(echo).toMatchObject({ kind: 'reply', ttl: 127 })
      if (!echo) throw new Error('no echo')
      expect(routers(engine, echo)).toEqual([routerId])
    }
  })

  it('routers ping from the exit interface with TTL 255', () => {
    const lab = twoRouterLab()
    const reached = run(lab, ping('r1', '10.0.2.10'))
    expect(echoes(reached.engine, reached.id)).toEqual([expect.objectContaining({ kind: 'reply', fromIp: '10.0.2.10', ttl: 127 })])
    const request = reached.engine.events().find((event) => event.deviceId === 'r1' && event.action === 'created')
    expect(request?.outbound).toMatchObject({ payload: { src: '10.0.12.1', ttl: 255 } })
    const noRoute = run(lab, ping('r1', '10.5.5.5'))
    expect(echoes(noRoute.engine, noRoute.id)).toEqual([expect.objectContaining({ kind: 'unreachable', fromIp: '10.0.1.1' })])
  })

  it('answers own addresses and loopback without a frame', () => {
    for (const target of ['10.0.1.10', '127.0.0.1']) {
      const { engine, id } = run(twoRouterLab(), ping('pc1', target, 2))
      expect(echoes(engine, id)).toEqual([
        expect.objectContaining({ kind: 'reply', fromIp: target, ttl: 128, rttMs: 0 }),
        expect.objectContaining({ kind: 'reply', fromIp: target, ttl: 128, rttMs: 0 }),
      ])
      expect(engine.transmissions()).toEqual([])
    }
  })

  it('is deterministic: the same lab and request give the same events', () => {
    const lab = twoRouterLab()
    const first = run(lab, ping('pc1', '10.0.2.10', 2)).engine.events()
    const second = run(lab, ping('pc1', '10.0.2.10', 2)).engine.events()
    expect(first.length).toBeGreaterThan(10)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })
})
