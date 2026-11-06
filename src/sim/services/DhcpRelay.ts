import type { Device } from '../../domain'
import { Ipv4 } from '../../net/Ipv4'
import { L3Interfaces } from '../../net/L3Interfaces'
import { type DeviceContext, type DhcpMessage, LIMITED_BROADCAST_IP, SIM_PORTS, type TransportDelivery, UNSPECIFIED_IP } from '../contract'
import { ServiceNotes } from './ServiceNotes'
import { ServiceSender } from './ServiceSender'
import { ServiceWire } from './ServiceWire'

/**
 * DHCP relay agent (`ip helper-address`, docs/SIMULATION.md §7.3): client broadcasts arriving on an
 * interface with helper addresses go unicast to every helper with giaddr = that interface's address;
 * the server's answers come back to giaddr and are broadcast on that interface.
 */
export class DhcpRelay {
  /** `ip helper-address` list of an L3 interface (routed port, sub-interface, SVI). */
  static helpersOf(device: Device, interfaceId: string): readonly string[] {
    for (const port of device.ports) {
      if (port.role !== 'routed') continue
      if (port.id === interfaceId) return port.l3.helperAddresses ?? []
      const sub = port.subInterfaces.find((candidate) => candidate.id === interfaceId)
      if (sub) return sub.l3.helperAddresses ?? []
    }
    const svi = device.switching?.svis.find((candidate) => `Vlan${candidate.vlan}` === interfaceId)
    return svi?.l3.helperAddresses ?? []
  }

  static hasHelpers(device: Device): boolean {
    return L3Interfaces.of(device).some((iface) => DhcpRelay.helpersOf(device, iface.id).length > 0)
  }

  /** Client → servers. */
  static toServers(ctx: DeviceContext, delivery: TransportDelivery, message: DhcpMessage, helpers: readonly string[]): void {
    const { event } = delivery
    const iface = L3Interfaces.find(ctx.device, delivery.interfaceId)
    const giaddr = message.relayIp !== UNSPECIFIED_IP ? message.relayIp : iface && L3Interfaces.isAddressed(iface) ? iface.address : null
    if (giaddr === null) {
      ServiceNotes.add(event, 'in', 'dhcpNoPool', { iface: delivery.interfaceId })
      event.conclude('dropped', 7, 'dhcpNoPool')
      return
    }
    ServiceNotes.add(event, 'in', 'dhcpRelayGiaddr', { giaddr })
    event.conclude('delivered', 7)
    for (const helper of helpers) {
      if (!Ipv4.isValid(helper)) continue
      ServiceSender.send(ctx, {
        ids: ctx.newPdu(delivery.ids.flowId),
        dst: helper,
        payload: ServiceWire.udp(SIM_PORTS.dhcpServer, SIM_PORTS.dhcpServer, { ...message, relayIp: giaddr }),
        causeEventId: event.id,
        notes: [ServiceNotes.message('dhcpRelayed', { server: helper })],
      })
    }
  }

  /** Server → client: broadcast the answer on the interface that owns giaddr. */
  static toClient(ctx: DeviceContext, delivery: TransportDelivery, message: DhcpMessage): void {
    const { event } = delivery
    const iface = L3Interfaces.of(ctx.device).find((candidate) => candidate.address === message.relayIp && message.relayIp !== UNSPECIFIED_IP)
    if (!iface) {
      ServiceNotes.add(event, 'in', 'dhcpNotForThisClient', { mac: message.clientMac })
      event.conclude('dropped', 7, 'dhcpNotForThisClient')
      return
    }
    ServiceNotes.add(event, 'in', 'dhcpRelayToClient', { iface: iface.id })
    event.conclude('delivered', 7)
    ServiceSender.send(ctx, {
      ids: ctx.newPdu(delivery.ids.flowId),
      dst: LIMITED_BROADCAST_IP,
      src: iface.address,
      payload: ServiceWire.udp(SIM_PORTS.dhcpServer, SIM_PORTS.dhcpClient, message),
      egressInterfaceId: iface.id,
      linkDestination: { kind: 'broadcast' },
      causeEventId: event.id,
      notes: [ServiceNotes.message('dhcpRelayToClient', { iface: iface.id })],
    })
  }
}
