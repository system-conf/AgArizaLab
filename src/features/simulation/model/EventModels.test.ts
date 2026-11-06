import { describe, expect, it } from 'vitest'
import type { Pdu } from '../simulationServices'
import { EventFilters, FILTER_PROTOCOLS } from './EventFilters'
import { EventSummaries } from './EventSummaries'
import { ARP_PACKET, ARP_REQUEST, ECHO_FRAME, MAC_A, simEvent } from './simFixtures'

function udpFrame(payload: Extract<Pdu, { kind: 'ipv4' }>['payload']): Pdu {
  return { kind: 'ipv4', src: '10.0.0.1', dst: '10.0.0.2', ttl: 128, identification: 1, payload }
}

describe('EventFilters', () => {
  it('toggles protocols in chip order', () => {
    const none = EventFilters.none()
    const some = EventFilters.toggle(EventFilters.toggle(none, 'dns'), 'arp')
    expect(some.protocols).toEqual(['arp', 'dns'])
    expect(EventFilters.toggle(some, 'arp').protocols).toEqual(['dns'])
    expect(EventFilters.all().protocols).toEqual(FILTER_PROTOCOLS)
  })

  it('matches by protocol and flow; PDU-less events follow any protocol', () => {
    const arp = simEvent({ id: 1, protocol: 'arp' })
    const timeout = simEvent({ id: 2, protocol: null, action: 'timedOut', reason: 'requestTimedOut' })
    const onlyIcmp = { protocols: ['icmp'] as const }
    expect(EventFilters.apply(onlyIcmp, [arp, timeout]).map((event) => event.id)).toEqual([2])
    expect(EventFilters.apply(EventFilters.none(), [arp, timeout])).toEqual([])
    expect(EventFilters.matches({ protocols: ['arp'], flowIds: ['r2'] }, arp)).toBe(false)
    expect(EventFilters.matches({ protocols: ['arp'], flowIds: ['r1'] }, arp)).toBe(true)
  })

  it('builds rows with action summary, PDU info and reason', () => {
    const row = EventFilters.row(simEvent({ id: 5, time: 3, lastDeviceId: 'sw', deviceId: 'pc2', inbound: ECHO_FRAME, action: 'dropped', reason: 'notForThisInterface' }))
    expect(row).toMatchObject({
      eventId: 5,
      time: 3,
      lastDeviceId: 'sw',
      deviceId: 'pc2',
      summary: { key: 'simulation:actions.dropped' },
      info: { key: 'simulation:ui.pdu.echoRequest', params: { src: '10.0.0.1', dst: '10.0.0.2', sequence: 1 } },
      reason: { key: 'simulation:reasons.notForThisInterface' },
    })
    expect(EventFilters.row(simEvent({ id: 6 })).reason).toBeNull()
    expect('lastDeviceId' in EventFilters.row(simEvent({ id: 6 }))).toBe(false)
  })
})

describe('EventSummaries', () => {
  it('describes ARP requests, probes and replies', () => {
    expect(EventSummaries.ofPdu(ARP_REQUEST)).toEqual({ key: 'simulation:ui.pdu.arpRequest', params: { target: '10.0.0.2', sender: '10.0.0.1' } })
    const probe: Pdu = { ...ARP_REQUEST, payload: { ...ARP_PACKET, senderIp: '0.0.0.0' } }
    expect(EventSummaries.ofPdu(probe).key).toBe('simulation:ui.pdu.arpProbe')
    const reply: Pdu = { ...ARP_REQUEST, payload: { ...ARP_PACKET, operation: 'reply' } }
    expect(EventSummaries.ofPdu(reply)).toEqual({ key: 'simulation:ui.pdu.arpReply', params: { sender: '10.0.0.1', mac: MAC_A } })
  })

  it('describes ICMP errors, DHCP, DNS, HTTP, TCP and serial frames', () => {
    const quote = { src: '10.0.0.1', dst: '8.8.8.8', ttl: 1, identification: 1, transport: { kind: 'other' } } as const
    expect(EventSummaries.ofPdu(udpFrame({ kind: 'icmp', type: 'timeExceeded', code: 'ttlInTransit', original: quote })).key).toBe('simulation:ui.pdu.timeExceeded')
    const dhcp = udpFrame({
      kind: 'udp',
      srcPort: 68,
      dstPort: 67,
      payload: { kind: 'dhcp', messageType: 'discover', transactionId: 255, clientMac: MAC_A, clientIp: '0.0.0.0', yourIp: '0.0.0.0', serverIp: '0.0.0.0', relayIp: '0.0.0.0', broadcast: true, options: {} },
    })
    expect(EventSummaries.ofPdu(dhcp)).toEqual({ key: 'simulation:ui.pdu.dhcp', params: { type: 'DISCOVER', xid: '0x000000FF' } })
    const dns = (response: boolean) =>
      udpFrame({
        kind: 'udp',
        srcPort: 53,
        dstPort: 50000,
        payload: { kind: 'dns', id: 1, response, recursionDesired: true, recursionAvailable: true, authoritative: false, responseCode: 'nameError', questions: [{ name: 'x.com', type: 'A' }], answers: [] },
      })
    expect(EventSummaries.ofPdu(dns(false)).key).toBe('simulation:ui.pdu.dnsQuery')
    expect(EventSummaries.ofPdu(dns(true))).toEqual({ key: 'simulation:ui.pdu.dnsNoAnswer', params: { name: 'x.com', code: 'nameError' } })
    const http = udpFrame({ kind: 'tcp', srcPort: 80, dstPort: 50000, flags: ['ack'], payload: { kind: 'http', message: 'response', status: 200, contentBytes: 10 } })
    expect(EventSummaries.ofPdu(http)).toEqual({ key: 'simulation:ui.pdu.httpResponse', params: { status: 200 } })
    const syn = udpFrame({ kind: 'tcp', srcPort: 50000, dstPort: 80, flags: ['syn'], payload: null })
    expect(EventSummaries.ofPdu(syn).params).toMatchObject({ flags: '[SYN]', dstPort: 80 })
    expect(EventSummaries.ofPdu({ kind: 'hdlc', payload: { kind: 'ipv4', src: '1.1.1.1', dst: '2.2.2.2', ttl: 9, identification: 1, payload: { kind: 'udp', srcPort: 1, dstPort: 2, payload: { kind: 'data', bytes: 1 } } } }).key).toBe('simulation:ui.pdu.udp')
  })

  it('says when an event has no PDU', () => {
    expect(EventSummaries.of(simEvent({ id: 1, action: 'timedOut' })).key).toBe('simulation:ui.pdu.none')
  })
})
