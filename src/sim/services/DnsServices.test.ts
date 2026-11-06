import { describe, expect, it } from 'vitest'
import type { NetworkState, ResolveResult } from '../../domain'
import { DefaultNetworkEngine } from '../../engine/DefaultNetworkEngine'
import { editAddress, editHost } from '../../engine/testLabs'
import type { DnsServerSettings } from '../../domain'
import type { SimEvent } from '../contract'
import { SimulationKernel } from '../core/SimulationKernel'
import { dnsLab } from './testServiceLabs'
import { serviceTestLayers } from './testServiceStack'

const engine = new DefaultNetworkEngine()
const INTRANET = { type: 'A', name: 'intranet.local', address: '192.168.1.50' } as const
const GOOGLE = '142.250.187.206'

function resolve(network: NetworkState, name: string, options: { useCache?: boolean; servers?: string[] } = {}) {
  const kernel = SimulationKernel.create(network, serviceTestLayers)
  const id = kernel.inject({ kind: 'dnsQuery', deviceId: 'pc', name, ...options })
  kernel.runUntilIdle()
  const record = kernel.request(id)
  if (record?.result?.kind !== 'dns') throw new Error('no DNS result')
  return { kernel, record, answer: record.result.answer, events: kernel.events() }
}

function lab(r1: Partial<DnsServerSettings>, r2: Partial<DnsServerSettings> = { forwarders: ['8.8.8.8'] }, pcDns?: string[]): NetworkState {
  return dnsLab(r1, r2, pcDns)
}

function eventWith(events: readonly SimEvent[], deviceId: string, note: string): SimEvent | undefined {
  return events.find((event) => event.deviceId === deviceId && event.notes.some((entry) => entry.message.key === `simulation:notes.services.${note}`))
}

/** The simulator gives the rule engine's answer (oracle, docs/SIMULATION.md §10.2). */
function expectEngineParity(network: NetworkState, name: string, answer: ResolveResult): void {
  expect(answer).toEqual(engine.resolve(network, 'pc', name))
}

describe('DNS', () => {
  it('answers from the server records (names are case-insensitive, the root dot is ignored)', () => {
    const network = lab({ records: [INTRANET] })
    const { answer, events, record } = resolve(network, 'Intranet.Local.')
    expect(answer).toEqual({ ok: true, ip: '192.168.1.50', dnsServer: '192.168.1.1' })
    expect(eventWith(events, 'r1', 'dnsRecordFound')?.action).toBe('replied')
    expect(events.map((event) => [event.time, event.deviceId, event.action])).toEqual([
      [0, 'pc', 'created'],
      [1, 'hub', 'flooded'],
      [2, 'r1', 'replied'],
      [2, 'r1', 'created'],
      [2, 'printer', 'dropped'],
      [3, 'hub', 'flooded'],
      [4, 'pc', 'delivered'],
      [4, 'printer', 'dropped'],
    ])
    expect(record.finishedAt).toBe(4)
    expectEngineParity(network, 'Intranet.Local.', answer)
  })

  it('forwards to the internet resolver, which answers from its names', () => {
    const network = lab({ forwarders: ['8.8.8.8'] })
    const { answer, events } = resolve(network, 'google.com')
    expect(answer).toEqual({ ok: true, ip: GOOGLE, dnsServer: '192.168.1.1' })
    expect(eventWith(events, 'r1', 'dnsForwarded')?.action).toBe('delivered')
    expect(eventWith(events, 'internet', 'dnsPublicResolver')?.action).toBe('replied')
    expect(eventWith(events, 'r1', 'dnsForwardAnswer')?.action).toBe('created')
    expectEngineParity(network, 'google.com', answer)
  })

  it('follows a forwarder chain r1 → r2 → 8.8.8.8', () => {
    const network = lab({ forwarders: ['10.0.0.2'] }, { forwarders: ['8.8.8.8'] })
    const { answer, events } = resolve(network, 'google.com')
    expect(answer).toEqual({ ok: true, ip: GOOGLE, dnsServer: '192.168.1.1' })
    expect(eventWith(events, 'r2', 'dnsForwarded')).toBeDefined()
    expectEngineParity(network, 'google.com', answer)
  })

  it('drops a query that comes back in a forwarding loop; the client times out', () => {
    const network = lab({ forwarders: ['10.0.0.2'] }, { forwarders: ['10.0.0.1'] })
    const { answer, events, record } = resolve(network, 'google.com')
    expect(eventWith(events, 'r1', 'dnsLoop')).toMatchObject({ action: 'dropped', reason: 'dnsLoop' })
    expect(answer).toEqual({ ok: false, reason: 'dnsUnreachable', dnsServer: '192.168.1.1' })
    expect(record.finishedAt).toBe(2000)
    expectEngineParity(network, 'google.com', answer)
  })

  it('answers NXDOMAIN from a server without forwarders and from the internet resolver', () => {
    const local = lab({ records: [INTRANET] })
    const own = resolve(local, 'missing.local')
    expect(own.answer).toEqual({ ok: false, reason: 'nameNotFound', dnsServer: '192.168.1.1' })
    expect(eventWith(own.events, 'r1', 'dnsNoForwarders')).toBeDefined()
    expectEngineParity(local, 'missing.local', own.answer)
    const internet = lab({ forwarders: ['8.8.8.8'] })
    const remote = resolve(internet, 'nothing.example')
    expect(remote.answer).toEqual({ ok: false, reason: 'nameNotFound', dnsServer: '192.168.1.1' })
    expectEngineParity(internet, 'nothing.example', remote.answer)
  })

  it('reports the client-side outcomes of DnsQuery.run', () => {
    const noServers = editHost(lab({}), 'pc', { dnsServers: [] })
    expect(resolve(noServers, 'google.com').answer).toEqual({ ok: false, reason: 'dnsNotSet' })

    // The printer runs no DNS: ICMP port unreachable → next server; none left → dnsNoAnswer.
    const notDns = lab({ records: [INTRANET] }, {}, ['192.168.1.50'])
    const noAnswer = resolve(notDns, 'intranet.local')
    expect(noAnswer.answer).toEqual({ ok: false, reason: 'dnsNoAnswer', dnsServer: '192.168.1.50' })
    expect(noAnswer.record.finishedAt).toBe(4)
    expectEngineParity(notDns, 'intranet.local', noAnswer.answer)

    const ordered = lab({ records: [INTRANET] }, {}, ['192.168.1.50', '192.168.1.1'])
    const second = resolve(ordered, 'intranet.local')
    expect(second.answer).toEqual({ ok: true, ip: '192.168.1.50', dnsServer: '192.168.1.1' })
    expectEngineParity(ordered, 'intranet.local', second.answer)

    // A public address that runs no resolver: the cloud drops the query, the client waits 2000 ms.
    const silent = lab({}, {}, ['203.0.113.77'])
    const timedOut = resolve(silent, 'google.com')
    expect(eventWith(timedOut.events, 'internet', 'dnsNotAResolver')).toMatchObject({ action: 'dropped', reason: 'dnsNotAResolver' })
    expect(timedOut.events.at(-1)).toMatchObject({ deviceId: 'pc', action: 'timedOut', reason: 'requestTimedOut' })
    expect(timedOut.answer).toEqual({ ok: false, reason: 'dnsUnreachable', dnsServer: '203.0.113.77' })
    expectEngineParity(silent, 'google.com', timedOut.answer)

    const invalidHost = editAddress(lab({ records: [INTRANET] }), 'pc', 'eth0', { address: '192.168.1.255' })
    expect(resolve(invalidHost, 'intranet.local').answer).toEqual({ ok: false, reason: 'invalidHostAddress', dnsServer: '192.168.1.1' })
  })

  it('uses the resolver cache for name lookups only, and flushes it on request', () => {
    const network = lab({ records: [INTRANET] })
    const kernel = SimulationKernel.create(network, serviceTestLayers)
    kernel.inject({ kind: 'dnsQuery', deviceId: 'pc', name: 'intranet.local', useCache: true })
    kernel.runUntilIdle()
    expect(kernel.runtime('pc')?.services.dnsCache).toEqual([{ name: 'intranet.local', address: '192.168.1.50', expiresAt: 4 + 300_000 }])
    const fromEvent = kernel.events().length
    const cached = kernel.inject({ kind: 'dnsQuery', deviceId: 'pc', name: 'INTRANET.local', useCache: true })
    kernel.runUntilDone(cached)
    expect(kernel.request(cached)?.result).toEqual({ kind: 'dns', name: 'INTRANET.local', answer: { ok: true, ip: '192.168.1.50', dnsServer: '192.168.1.1' } })
    expect(kernel.events().slice(fromEvent).map((event) => [event.deviceId, event.action, event.pduId])).toEqual([['pc', 'delivered', null]])
    const nslookup = kernel.inject({ kind: 'dnsQuery', deviceId: 'pc', name: 'intranet.local' })
    kernel.runUntilDone(nslookup)
    expect(kernel.events().filter((event) => event.deviceId === 'r1' && event.action === 'replied')).toHaveLength(2)
    const flush = kernel.inject({ kind: 'clearTable', deviceId: 'pc', table: 'dnsCache' })
    kernel.runUntilDone(flush)
    expect(kernel.request(flush)?.result).toEqual({ kind: 'cleared', entries: 1 })
    expect(kernel.runtime('pc')?.services.dnsCache).toEqual([])
  })

  it('flushes the cache when the host DNS servers change', () => {
    const network = lab({ records: [INTRANET] })
    const kernel = SimulationKernel.create(network, serviceTestLayers)
    kernel.runUntilDone(kernel.inject({ kind: 'dnsQuery', deviceId: 'pc', name: 'intranet.local', useCache: true }))
    expect(kernel.runtime('pc')?.services.dnsCache).toHaveLength(1)
    kernel.reconfigure(editHost(kernel.network(), 'pc', { dnsServers: ['192.168.1.1', '8.8.8.8'] }))
    expect(kernel.runtime('pc')?.services.dnsCache).toEqual([])
  })
})
