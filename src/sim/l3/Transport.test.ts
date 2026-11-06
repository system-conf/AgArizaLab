import { describe, expect, it } from 'vitest'
import type { SimRequest } from '../contract'
import { type Listener, l3Engine } from './l3TestLayers'
import { internetLab, twoRouterLab } from './l3TestLabs'

const dnsTo = (deviceId: string, server: string): SimRequest => ({ kind: 'dnsQuery', deviceId, name: 'example.com', servers: [server] })
const httpTo = (deviceId: string, serverIp: string): SimRequest => ({ kind: 'httpGet', deviceId, serverIp, host: 'example.com', path: '/' })

function exchange(request: SimRequest, listeners: readonly Listener[], lab = twoRouterLab()) {
  const { engine, services } = l3Engine(lab, { listeners })
  engine.inject(request)
  engine.runUntilIdle()
  return { engine, services }
}

describe('network layer: transport demux', () => {
  it('hands UDP / TCP to a listening service', () => {
    const { engine, services } = exchange(dnsTo('pc1', '10.0.2.10'), [{ deviceId: 'pc2', protocol: 'udp', port: 53 }])
    expect(services.datagrams.map((entry) => [entry.deviceId, entry.packet.payload.kind])).toEqual([['pc2', 'udp']])
    expect(engine.events().find((event) => event.deviceId === 'pc2')).toMatchObject({ action: 'delivered', layer: 7 })
  })

  it('a closed UDP port answers ICMP port unreachable from the asked address; the sender services hear it', () => {
    const { engine, services } = exchange(dnsTo('pc1', '10.0.2.10'), [])
    expect(engine.events().find((event) => event.deviceId === 'pc2' && event.action === 'dropped')).toMatchObject({ reason: 'portUnreachable', layer: 4 })
    expect(services.icmpErrors).toEqual([{ deviceId: 'pc1', reporterIp: '10.0.2.10', local: false, type: 'destinationUnreachable', code: 'port' }])
  })

  it('a closed TCP port answers RST, which the client receives', () => {
    const { services } = exchange(httpTo('pc1', '10.0.2.10'), [{ deviceId: 'pc1', protocol: 'tcp', port: 49152 }])
    const [reset] = services.datagrams
    expect(reset?.packet).toMatchObject({ src: '10.0.2.10', dst: '10.0.1.10', payload: { kind: 'tcp', srcPort: 80, dstPort: 49152, flags: ['ack', 'rst'], seq: 0, ack: 101 } })
  })

  it('routers answer closed ports too', () => {
    const { services } = exchange(dnsTo('pc1', '10.0.12.2'), [])
    expect(services.icmpErrors).toEqual([expect.objectContaining({ reporterIp: '10.0.12.2', code: 'port' })])
  })

  it('a router reports unreachable destinations of UDP to the sender services', () => {
    const { services } = exchange(dnsTo('pc1', '10.5.5.5'), [])
    expect(services.icmpErrors).toEqual([{ deviceId: 'pc1', reporterIp: '10.0.1.1', local: false, type: 'destinationUnreachable', code: 'host' }])
  })

  it("the sender's own ARP failure is a local error for the services", () => {
    const { services } = exchange(dnsTo('pc1', '10.0.1.99'), [])
    expect(services.icmpErrors).toEqual([{ deviceId: 'pc1', reporterIp: '10.0.1.10', local: true, type: 'destinationUnreachable', code: 'host' }])
  })

  it('the cloud hands public DNS to the services and ignores closed ports silently', () => {
    const served = exchange(dnsTo('pc', '8.8.8.8'), [{ deviceId: 'internet', protocol: 'udp', port: 53 }], internetLab())
    expect(served.services.datagrams.map((entry) => [entry.deviceId, entry.packet.dst, entry.packet.ttl])).toEqual([['internet', '8.8.8.8', 127]])
    const ignored = exchange(dnsTo('pc', '8.8.8.8'), [], internetLab())
    expect(ignored.services.icmpErrors).toEqual([])
    expect(ignored.engine.events().find((event) => event.deviceId === 'internet')).toMatchObject({ action: 'dropped' })
  })

  it('never sends ICMP errors about ICMP errors or broadcasts', () => {
    const { engine } = exchange(dnsTo('pc1', '10.0.1.255'), [])
    const atR1 = engine.events().filter((event) => event.deviceId === 'r1')
    expect(atR1.map((event) => [event.action, event.reason])).toEqual([['dropped', 'portUnreachable']])
    expect(atR1[0]?.notes.map((note) => note.message.key)).toContain('simulation:notes.l3.noIcmpAboutIcmpError')
  })
})
