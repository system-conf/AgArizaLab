// The default wiring (createSimulation) and the wave 3.2 contract additions across the three layers.
import { describe, expect, it } from 'vitest'
import { editHost } from '../engine/testLabs'
import { officeLab } from '../engine/testNetworks'
import { createSimulation } from './createSimulation'
import { FrameEncoder } from './pcap/FrameEncoder'
import { PduLayers } from './index'

describe('createSimulation', () => {
  it('wires S1, S2 and S3 and starts from a quiet, cold network', () => {
    const engine = createSimulation(officeLab())
    expect(engine.events()).toEqual([])
    for (const device of engine.network().devices) {
      expect(engine.runtime(device.id)?.link.macTable ?? [], device.id).toEqual([])
      expect(engine.runtime(device.id)?.link.arp ?? [], device.id).toEqual([])
    }
    const id = engine.inject({ kind: 'ping', deviceId: 'pc1', targetIp: '8.8.8.8', count: 1, size: 32 })
    engine.runUntilDone(id)
    expect(engine.request(id)?.result).toMatchObject({ kind: 'ping', echoes: [{ kind: 'reply', fromIp: '8.8.8.8' }] })
    // The first frame of a cold network: pc1 asks ARP for its gateway, the switch floods it.
    expect(engine.events().slice(0, 3).map((event) => [event.deviceId, event.protocol, event.action])).toEqual([
      ['pc1', 'icmp', 'buffered'],
      ['pc1', 'arp', 'created'],
      ['switch', 'arp', 'flooded'],
    ])
  })

  it("adds a service's notes to the 'created' event of its packet (Ipv4Send.notes)", () => {
    const engine = createSimulation(officeLab())
    engine.runUntilDone(engine.inject({ kind: 'dnsQuery', deviceId: 'pc1', name: 'google.com' }))
    const query = engine.events().find((event) => event.deviceId === 'pc1' && event.protocol === 'dns' && event.inbound === null)
    expect(query?.notes.some((note) => note.layer === 7 && note.direction === 'out')).toBe(true)
    expect(query?.notes.some((note) => note.layer === 3 && note.direction === 'out')).toBe(true)
  })

  it('quotes the IPv4 total length of the packet an ICMP error is about', () => {
    const engine = createSimulation(editHost(officeLab(), 'pc1', { dnsServers: ['192.168.1.150'] }))
    engine.runUntilDone(engine.inject({ kind: 'dnsQuery', deviceId: 'pc1', name: 'google.com' }))
    const errors = engine.events().flatMap((event) => {
      const packet = event.outbound ? PduLayers.ipv4Of(event.outbound) : null
      return packet?.payload.kind === 'icmp' && packet.payload.type === 'destinationUnreachable' ? [packet.payload.original] : []
    })
    const query = engine.events().find((event) => event.deviceId === 'pc1' && event.protocol === 'dns')
    const sent = query?.outbound ? PduLayers.ipv4Of(query.outbound) : null
    expect(errors.length).toBeGreaterThan(0)
    expect(sent).not.toBeNull()
    if (sent) expect(errors[0]?.totalLength).toBe(FrameEncoder.ipv4Length(sent))
  })
})
