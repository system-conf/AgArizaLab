import { describe, expect, it } from 'vitest'
import type { NetworkState } from '../../domain'
import { editDevice } from '../../engine/testLabs'
import { SimulationKernel } from '../core/SimulationKernel'
import { serviceTestLayers } from './testServiceStack'
import { webLab } from './testServiceLabs'
import { NOT_FOUND_BYTES, WEB_PAGE_BYTES } from './WebServer'

const GOOGLE = '142.250.187.206'

function get(network: NetworkState, serverIp: string, path = '/', host = 'google.com') {
  const kernel = SimulationKernel.create(network, serviceTestLayers)
  const id = kernel.inject({ kind: 'httpGet', deviceId: 'pc', serverIp, host, path })
  kernel.runUntilIdle()
  const record = kernel.request(id)
  if (record?.result?.kind !== 'http') throw new Error('no HTTP result')
  return { kernel, record, outcome: record.result.outcome, events: kernel.events() }
}

describe('HTTP', () => {
  it('fetches a page: handshake, GET, response, close', () => {
    const { outcome, events, record, kernel } = get(webLab(), GOOGLE)
    expect(outcome).toEqual({ ok: true, status: 200, contentBytes: WEB_PAGE_BYTES })
    const segments = events
      .filter((event) => event.action === 'created')
      .map((event) => {
        const packet = event.outbound?.kind === 'ipv4' ? event.outbound : null
        return packet?.payload.kind === 'tcp' ? [event.deviceId, packet.payload.flags.join('+')] : null
      })
    expect(segments).toEqual([
      ['pc', 'syn'],
      ['internet', 'syn+ack'],
      ['pc', 'ack+psh'],
      ['internet', 'ack+fin+psh'],
      ['pc', 'ack+fin'],
    ])
    const response = events.find((event) => event.deviceId === 'internet' && event.action === 'created' && event.layer === 7 && event.notes.some((note) => note.message.key === 'simulation:notes.services.httpResponse'))
    expect(response?.outbound).toMatchObject({ ttl: 118, src: GOOGLE, dst: '192.168.1.10' })
    expect(record.finishedAt).toBe(8)
    expect(kernel.runtime('pc')?.services.sessions).toEqual([])
  })

  it('answers 404 for a page the site does not have', () => {
    expect(get(webLab(), GOOGLE, '/missing').outcome).toEqual({ ok: true, status: 404, contentBytes: NOT_FOUND_BYTES })
  })

  it('is refused (RST) by a public address that runs no web server', () => {
    const { outcome, events } = get(webLab(), '203.0.113.99')
    expect(outcome).toEqual({ ok: false, reason: 'connectionRefused' })
    expect(events.find((event) => event.deviceId === 'internet')?.action).toBe('replied')
  })

  it('fails locally without a gateway, and on ICMP host unreachable from a router without a route', () => {
    expect(get(webLab(''), GOOGLE).outcome).toEqual({ ok: false, reason: 'gatewayNotSet' })
    const noRoute = editDevice(webLab(), 'r', (device) => ({ ...device, routing: { ipRouting: true, staticRoutes: [] } }))
    const { outcome, events } = get(noRoute, GOOGLE)
    expect(outcome).toEqual({ ok: false, reason: 'noRoute' })
    expect(events.at(-1)?.notes.map((note) => note.message.key)).toContain('simulation:notes.services.httpUnreachable')
  })

  it('times out after 5000 ms when nothing answers', () => {
    const { outcome, record, events } = get(webLab(), '10.9.9.9')
    expect(outcome).toEqual({ ok: false, reason: 'requestTimedOut' })
    expect(record.finishedAt).toBe(5000)
    expect(events.at(-1)).toMatchObject({ deviceId: 'pc', action: 'timedOut', protocol: 'http', reason: 'requestTimedOut' })
  })
})
