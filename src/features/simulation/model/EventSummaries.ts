import type { LocalizedMessage } from '../../../domain/Messages'
import { localizedMessage } from '../../../i18n/messageKeys'
import { PduLayers, type IcmpMessage, type Ipv4Packet, type Pdu, type SimEvent } from '../simulationServices'

const UNSPECIFIED_IP = '0.0.0.0'

/**
 * One-line description of an event's PDU (the "Info" column of a packet analyser): the top-most
 * protocol with its key values. Values stay protocol notation (addresses, ports, flags).
 */
export class EventSummaries {
  static of(event: SimEvent): LocalizedMessage {
    const pdu = event.inbound ?? event.outbound
    return pdu ? EventSummaries.ofPdu(pdu) : localizedMessage('simulation:ui.pdu.none')
  }

  static ofPdu(pdu: Pdu): LocalizedMessage {
    if (pdu.kind === 'ethernet' && pdu.payload.kind === 'arp') {
      const arp = pdu.payload
      if (arp.operation === 'reply') return localizedMessage('simulation:ui.pdu.arpReply', { sender: arp.senderIp, mac: arp.senderMac })
      if (arp.senderIp === UNSPECIFIED_IP) return localizedMessage('simulation:ui.pdu.arpProbe', { target: arp.targetIp })
      return localizedMessage('simulation:ui.pdu.arpRequest', { target: arp.targetIp, sender: arp.senderIp })
    }
    const packet = PduLayers.ipv4Of(pdu)
    return packet ? EventSummaries.ofPacket(packet) : localizedMessage('simulation:ui.pdu.serial')
  }

  private static ofPacket(packet: Ipv4Packet): LocalizedMessage {
    const { src, dst } = packet
    const transport = packet.payload
    switch (transport.kind) {
      case 'icmp':
        return EventSummaries.ofIcmp(packet, transport)
      case 'udp': {
        const payload = transport.payload
        if (payload.kind === 'dhcp') {
          const xid = `0x${payload.transactionId.toString(16).toUpperCase().padStart(8, '0')}`
          return localizedMessage('simulation:ui.pdu.dhcp', { type: payload.messageType.toUpperCase(), xid })
        }
        if (payload.kind === 'dns') {
          const name = payload.questions[0]?.name ?? ''
          if (!payload.response) return localizedMessage('simulation:ui.pdu.dnsQuery', { name })
          const answer = payload.answers[0]
          if (answer) return localizedMessage('simulation:ui.pdu.dnsAnswer', { name, ip: answer.address })
          return localizedMessage('simulation:ui.pdu.dnsNoAnswer', { name, code: payload.responseCode })
        }
        return localizedMessage('simulation:ui.pdu.udp', { src, dst, srcPort: transport.srcPort, dstPort: transport.dstPort })
      }
      case 'tcp': {
        const payload = transport.payload
        if (payload?.kind === 'http') {
          return payload.message === 'request'
            ? localizedMessage('simulation:ui.pdu.httpRequest', { path: payload.path, host: payload.host })
            : localizedMessage('simulation:ui.pdu.httpResponse', { status: payload.status })
        }
        const flags = transport.flags.map((flag) => flag.toUpperCase()).join(', ')
        return localizedMessage('simulation:ui.pdu.tcp', { flags: `[${flags}]`, src, dst, srcPort: transport.srcPort, dstPort: transport.dstPort })
      }
    }
    return localizedMessage('simulation:ui.pdu.ipv4', { src, dst })
  }

  private static ofIcmp(packet: Ipv4Packet, message: IcmpMessage): LocalizedMessage {
    const { src, dst } = packet
    switch (message.type) {
      case 'echoRequest':
        return localizedMessage('simulation:ui.pdu.echoRequest', { src, dst, sequence: message.sequence })
      case 'echoReply':
        return localizedMessage('simulation:ui.pdu.echoReply', { src, dst, sequence: message.sequence })
      case 'destinationUnreachable':
        return localizedMessage('simulation:ui.pdu.unreachable', { src })
      case 'timeExceeded':
        return localizedMessage('simulation:ui.pdu.timeExceeded', { src })
    }
  }
}
