// Test-only: hand-made events and transmissions (docs/SIMULATION.md §8: U3 builds against fixtures).
import type { ArpPacket, EthernetFrame } from '../../../sim'
import type { SimEvent, SimTransmission } from '../simulationServices'

export const MAC_A = '02:00:00:00:00:0A'
export const MAC_B = '02:00:00:00:00:0B'

export const ECHO_FRAME: EthernetFrame = {
  kind: 'ethernet',
  src: MAC_A,
  dst: MAC_B,
  payload: { kind: 'ipv4', src: '10.0.0.1', dst: '10.0.0.2', ttl: 128, identification: 1, payload: { kind: 'icmp', type: 'echoRequest', identifier: 1, sequence: 1, dataBytes: 32 } },
}

export const ARP_PACKET: ArpPacket = { kind: 'arp', operation: 'request', senderMac: MAC_A, senderIp: '10.0.0.1', targetMac: '00:00:00:00:00:00', targetIp: '10.0.0.2' }

export const ARP_REQUEST: EthernetFrame = { kind: 'ethernet', src: MAC_A, dst: 'FF:FF:FF:FF:FF:FF', payload: ARP_PACKET }

export function simEvent(overrides: Partial<SimEvent> & Pick<SimEvent, 'id'>): SimEvent {
  return {
    time: 0,
    seq: overrides.id,
    deviceId: 'pc1',
    outPortIds: [],
    flowId: 'r1',
    pduId: 'p1',
    frameId: 'f1',
    protocol: 'icmp',
    inbound: null,
    outbound: null,
    action: 'created',
    layer: 3,
    notes: [],
    ...overrides,
  }
}

export function transmission(overrides: Partial<SimTransmission> & Pick<SimTransmission, 'id'>): SimTransmission {
  return {
    eventId: 1,
    linkId: 'l1',
    from: { deviceId: 'pc1', portId: 'eth0' },
    to: { deviceId: 'sw', portId: 'fa1' },
    departAt: 0,
    arriveAt: 1,
    flowId: 'r1',
    pduId: 'p1',
    frameId: 'f1',
    frame: ECHO_FRAME,
    protocol: 'icmp',
    ...overrides,
  }
}
