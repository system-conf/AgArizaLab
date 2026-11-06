import { describe, expect, it } from 'vitest'
import { hubLab, toyLayers } from '../core/kernelTestLayers'
import { SimulationKernel } from '../core'
import type { SimTransmission, WireFrame } from '../contract'
import { PCAP_LINKTYPE_ETHERNET, PCAP_MAGIC, PcapWriter } from './PcapWriter'
import { readEthernet, readPcap } from './PcapTestReader'

function transmission(id: number, departAt: number, frame: WireFrame, linkId = 'l1'): SimTransmission {
  return {
    id,
    eventId: id,
    linkId,
    from: { deviceId: 'a', portId: 'eth0' },
    to: { deviceId: 'b', portId: 'eth0' },
    departAt,
    arriveAt: departAt + 1,
    flowId: 'r1',
    pduId: `p${id}`,
    frameId: `f${id}`,
    frame,
    protocol: frame.kind === 'hdlc' ? 'icmp' : 'arp',
  }
}

const ARP: WireFrame = {
  kind: 'ethernet',
  src: '02:00:00:00:00:01',
  dst: 'FF:FF:FF:FF:FF:FF',
  payload: { kind: 'arp', operation: 'request', senderMac: '02:00:00:00:00:01', senderIp: '10.0.0.1', targetMac: '00:00:00:00:00:00', targetIp: '10.0.0.2' },
}

const SERIAL: WireFrame = {
  kind: 'hdlc',
  payload: { kind: 'ipv4', src: '10.0.0.1', dst: '10.0.0.2', ttl: 255, identification: 1, payload: { kind: 'icmp', type: 'echoRequest', identifier: 1, sequence: 1, dataBytes: 32 } },
}

describe('PcapWriter', () => {
  it('writes the classic libpcap global header (Ethernet link type)', () => {
    const file = readPcap(PcapWriter.write([]).bytes)
    expect(file).toMatchObject({ magic: PCAP_MAGIC, versionMajor: 2, versionMinor: 4, snaplen: 65535, linkType: PCAP_LINKTYPE_ETHERNET, records: [] })
    expect([...PcapWriter.write([]).bytes.subarray(0, 4)]).toEqual([0xd4, 0xc3, 0xb2, 0xa1])
  })

  it('orders records by departure and stamps them with virtual time', () => {
    const result = PcapWriter.write([transmission(2, 1500, ARP), transmission(1, 2, ARP)], { startEpochMs: 1_700_000_000_000 })
    expect(result.packets).toBe(2)
    const records = readPcap(result.bytes).records
    expect(records.map((record) => [record.seconds, record.micros])).toEqual([
      [1_700_000_000, 2000],
      [1_700_000_001, 500_000],
    ])
    expect(records.every((record) => record.capturedLength === 60 && record.originalLength === 60)).toBe(true)
  })

  it('skips serial frames and can capture on chosen links only', () => {
    const all = PcapWriter.write([transmission(1, 0, ARP), transmission(2, 0, SERIAL), transmission(3, 0, ARP, 'l2')])
    expect([all.packets, all.skippedSerial]).toEqual([2, 1])
    expect(PcapWriter.write([transmission(1, 0, ARP), transmission(3, 0, ARP, 'l2')], { linkIds: ['l2'] }).packets).toBe(1)
  })

  it('exports a kernel run frame by frame', () => {
    const engine = SimulationKernel.create(hubLab(), toyLayers)
    engine.runUntilDone(engine.inject({ kind: 'ping', deviceId: 'pc1', targetIp: '10.0.0.2', count: 1, size: 32 }))
    const transmissions = engine.transmissions()
    const file = readPcap(PcapWriter.write(transmissions).bytes)
    expect(file.records).toHaveLength(transmissions.length)
    const frames = file.records.map((record) => readEthernet(record.data))
    expect(frames.every((frame) => frame.etherType === 0x0806)).toBe(true)
    expect(frames.some((frame) => frame.payload.u16(6) === 2)).toBe(true)
  })
})
