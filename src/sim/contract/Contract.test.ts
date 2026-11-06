import { describe, expect, it } from 'vitest'
import { officeLab, vlanLab } from '../../engine/testNetworks'
import { labDevice } from '../../engine/testLabs'
import en from '../../locales/en/simulation.json'
import { DeviceProfiles } from './DeviceProfiles'
import type { EthernetFrame, Ipv4Packet } from './Pdu'
import { PduLayers } from './PduLayers'
import { SIM_ACTIONS, SIM_PROTOCOLS } from './SimEvent'
import { SimMessages } from './SimMessages'
import { SIM_REASONS } from './SimReason'

const echo: Ipv4Packet = {
  kind: 'ipv4',
  src: '192.168.1.20',
  dst: '8.8.8.8',
  ttl: 128,
  identification: 7,
  payload: { kind: 'icmp', type: 'echoRequest', identifier: 1, sequence: 3, dataBytes: 32 },
}

const discover: EthernetFrame = {
  kind: 'ethernet',
  src: '02:00:00:00:00:01',
  dst: 'FF:FF:FF:FF:FF:FF',
  tag: { vid: 10, pcp: 0 },
  payload: {
    kind: 'ipv4',
    src: '0.0.0.0',
    dst: '255.255.255.255',
    ttl: 128,
    identification: 1,
    payload: {
      kind: 'udp',
      srcPort: 68,
      dstPort: 67,
      payload: {
        kind: 'dhcp',
        messageType: 'discover',
        transactionId: 0xabc,
        clientMac: '02:00:00:00:00:01',
        clientIp: '0.0.0.0',
        yourIp: '0.0.0.0',
        serverIp: '0.0.0.0',
        relayIp: '0.0.0.0',
        broadcast: true,
        options: { hostName: 'PC1', requestedIp: '' },
      },
    },
  },
}

describe('PduLayers', () => {
  it('derives the header numbers from the payload', () => {
    expect(PduLayers.etherType(echo)).toBe(0x0800)
    expect(PduLayers.ipProtocol(echo.payload)).toBe(1)
    expect(PduLayers.icmpNumbers({ kind: 'icmp', type: 'destinationUnreachable', code: 'port', original: PduLayers.quote(echo, 60) })).toEqual({ type: 3, code: 3 })
    expect(PduLayers.dhcpOp('offer')).toBe(2)
    expect(PduLayers.dhcpOp('release')).toBe(1)
  })

  it('names the top-most protocol for filters', () => {
    expect(PduLayers.protocolOf(echo)).toBe('icmp')
    expect(PduLayers.protocolOf(discover)).toBe('dhcp')
    expect(PduLayers.protocolOf({ kind: 'hdlc', payload: echo })).toBe('icmp')
    const arp: EthernetFrame = { ...discover, payload: { kind: 'arp', operation: 'request', senderMac: 'a', senderIp: 'b', targetMac: 'c', targetIp: 'd' } }
    expect(PduLayers.protocolOf(arp)).toBe('arp')
    expect(PduLayers.ipv4Of(arp)).toBeNull()
  })

  it('quotes the packet an ICMP error is about', () => {
    expect(PduLayers.quote(echo, 60)).toEqual({
      src: '192.168.1.20',
      dst: '8.8.8.8',
      ttl: 128,
      identification: 7,
      totalLength: 60,
      transport: { kind: 'icmp', type: 'echoRequest', identifier: 1, sequence: 3 },
    })
  })

  it('describes every header bottom-up for the inspector', () => {
    const layers = PduLayers.describe(discover)
    expect(layers.map((layer) => [layer.layer, layer.protocol])).toEqual([[2, 'ethernet'], [3, 'ipv4'], [4, 'udp'], [7, 'dhcp']])
    expect(layers[0]?.fields).toContainEqual({ field: 'vlanId', value: '10' })
    expect(layers[0]?.fields).toContainEqual({ field: 'etherType', value: '0x0800 (IPv4)' })
    expect(layers[3]?.fields).toContainEqual({ field: 'transactionId', value: '0x00000ABC' })
    expect(layers[3]?.fields).toContainEqual({ field: 'dhcpOptions', value: 'host PC1' })
    expect(PduLayers.describe(echo).map((layer) => layer.protocol)).toEqual(['ipv4', 'icmp'])
  })
})

describe('DeviceProfiles', () => {
  it('reads what a device does from its configuration', () => {
    const office = officeLab()
    expect(DeviceProfiles.of(labDevice(office, 'router'))).toMatchObject({ ipRole: 'router', bridge: false, dhcpServer: true, dnsServer: true })
    expect(DeviceProfiles.of(labDevice(office, 'switch'))).toMatchObject({ ipRole: 'none', bridge: true, repeater: false })
    expect(DeviceProfiles.of(labDevice(office, 'pc1'))).toMatchObject({ ipRole: 'host', bridge: false, isp: false })
    expect(DeviceProfiles.of(labDevice(office, 'internet'))).toMatchObject({ ipRole: 'none', isp: true })
    expect(DeviceProfiles.of(labDevice(vlanLab(), 'ap'))).toMatchObject({ ipRole: 'none', bridge: true })
  })
})

describe('simulation messages', () => {
  it('has a message for every action, protocol and reason', () => {
    expect(Object.keys(en.actions).sort()).toEqual([...SIM_ACTIONS].sort())
    expect(Object.keys(en.protocols).sort()).toEqual([...SIM_PROTOCOLS].sort())
    expect(Object.keys(en.reasons).sort()).toEqual([...SIM_REASONS].sort())
    expect(SimMessages.reason('arpTimeout')).toEqual({ key: 'simulation:reasons.arpTimeout' })
    expect(SimMessages.layer(3)).toEqual({ key: 'simulation:layers.layer3' })
  })
})
