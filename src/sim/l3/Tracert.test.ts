import { describe, expect, it } from 'vitest'
import type { NetworkState } from '../../domain'
import { editHost } from '../../engine/testLabs'
import type { TracertResult } from '../contract'
import { l3Engine } from './l3TestLayers'
import { internetLab, staticRoute, tracert, twoRouterLab } from './l3TestLabs'

function trace(state: NetworkState, deviceId: string, targetIp: string): TracertResult {
  const { engine } = l3Engine(state)
  const id = engine.inject(tracert(deviceId, targetIp))
  expect(engine.runUntilDone(id).stoppedBy).toBe('requestDone')
  const result = engine.request(id)?.result
  if (result?.kind !== 'tracert') throw new Error('no tracert result')
  return result
}

/** Per hop: the answering addresses (or '*'), §10.1 takes the first answer. */
function lines(result: TracertResult): string[] {
  return result.hops.map((hop) => `${hop.ttl}: ${hop.probes.map((probe) => (probe.kind === 'timeout' ? '*' : `${probe.kind} ${probe.fromIp}`)).join(', ')}`)
}

describe('network layer: tracert', () => {
  it('lists every router by the address the probe arrived on, then the destination', () => {
    const result = trace(twoRouterLab(), 'pc1', '10.0.2.10')
    expect(lines(result)).toEqual([
      '1: timeExceeded 10.0.1.1, timeExceeded 10.0.1.1, timeExceeded 10.0.1.1',
      '2: timeExceeded 10.0.12.2, timeExceeded 10.0.12.2, timeExceeded 10.0.12.2',
      '3: echoReply 10.0.2.10, echoReply 10.0.2.10, echoReply 10.0.2.10',
    ])
    expect(result.ending).toEqual({ kind: 'reached' })
  })

  it('stops at an unreachable: the reporting router answers time exceeded one hop earlier', () => {
    const result = trace(twoRouterLab(), 'pc1', '10.5.5.5')
    expect(lines(result)).toEqual([
      '1: timeExceeded 10.0.1.1, timeExceeded 10.0.1.1, timeExceeded 10.0.1.1',
      '2: unreachable 10.0.1.1, unreachable 10.0.1.1, unreachable 10.0.1.1',
    ])
    expect(result.ending).toEqual({ kind: 'unreachable', reporterIp: '10.0.1.1', code: 'host' })
  })

  it('ends silent after four hops without answers (the router drops public destinations it has no route for)', () => {
    const result = trace(twoRouterLab(), 'pc1', '8.8.8.8')
    expect(lines(result)).toEqual(['1: timeExceeded 10.0.1.1, timeExceeded 10.0.1.1, timeExceeded 10.0.1.1', '2: *, *, *', '3: *, *, *', '4: *, *, *', '5: *, *, *'])
    expect(result.ending).toEqual({ kind: 'silent' })
  })

  it('reaches the internet behind the gateway: the cloud is the last hop', () => {
    const result = trace(internetLab(), 'pc', '8.8.8.8')
    expect(lines(result)).toEqual(['1: timeExceeded 192.168.1.1, timeExceeded 192.168.1.1, timeExceeded 192.168.1.1', '2: echoReply 8.8.8.8, echoReply 8.8.8.8, echoReply 8.8.8.8'])
  })

  it('a routing loop runs into the hop limit', () => {
    const lab = twoRouterLab({ r1: [staticRoute('0.0.0.0', '0.0.0.0', '10.0.12.2')], r2: [staticRoute('0.0.0.0', '0.0.0.0', '10.0.12.1')] })
    const result = trace(lab, 'pc1', '10.9.9.9')
    expect(result.hops).toHaveLength(30)
    expect(result.hops.map((hop) => (hop.probes[0]?.kind === 'timeExceeded' ? hop.probes[0].fromIp : '')).slice(0, 4)).toEqual([
      '10.0.1.1',
      '10.0.12.2',
      '10.0.12.1',
      '10.0.12.2',
    ])
    expect(result.ending).toEqual({ kind: 'hopLimit' })
  })

  it('local problems end the trace at once', () => {
    expect(trace(editHost(twoRouterLab(), 'pc1', { defaultGateway: '' }), 'pc1', '10.0.2.10')).toEqual({
      kind: 'tracert',
      hops: [],
      ending: { kind: 'localFailure', reason: 'gatewayNotSet' },
    })
    const outside = trace(editHost(twoRouterLab(), 'pc1', { defaultGateway: '10.0.9.1' }), 'pc1', '10.0.2.10')
    expect(outside.ending).toEqual({ kind: 'unreachable', reporterIp: '10.0.1.10', code: 'host' })
  })
})
